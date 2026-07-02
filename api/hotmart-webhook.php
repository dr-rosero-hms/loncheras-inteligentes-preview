<?php

declare(strict_types=1);

/**
 * /api/hotmart-webhook.php  (port PHP de la Cloudflare Pages Function)
 * ---------------------------------------------------------------------
 * Recibe webhooks de Hotmart cuando ocurre una compra/cancelación
 * y notifica al Dr. Rosero por Slack/Discord/Email (Resend).
 *
 * Para activar:
 *   1. En Hotmart: Configuración → Webhooks → Add webhook
 *      URL: https://<dominio>/api/hotmart-webhook.php
 *      Eventos: PURCHASE_COMPLETE, PURCHASE_APPROVED, PURCHASE_REFUNDED
 *   2. Claves en el config externo (li_cfg — ver _config.php):
 *      - HOTMART_WEBHOOK_TOKEN  (hottok que Hotmart envía para validar)
 *      - SLACK_WEBHOOK_URL      (opcional — Slack incoming webhook)
 *      - DISCORD_WEBHOOK_URL    (opcional — Discord webhook)
 *      - RESEND_API_KEY         (opcional — API key de Resend)
 *      - NOTIFICATION_EMAIL     (opcional — destinatario del email)
 *
 * Todo evento recibido se registra SIEMPRE en un log JSONL (append),
 * aunque no haya ningún canal de notificación configurado, para no
 * perder registro de compras: /home/u2065-1eiu0rm0tuqz/li-webhook-log.jsonl
 *
 * Respuestas (mismo shape/status que la función JS original):
 *   401 "Unauthorized"                — hottok inválido
 *   400 "Bad Request"                 — body no es JSON válido
 *   200 "ignored"                     — evento que no es compra aprobada/completa
 *   200 {"ok":true,"notified":N}      — compra notificada (N canales intentados)
 *   405 "Method Not Allowed"          — método distinto de POST
 */

require __DIR__ . '/_config.php';

const LI_WEBHOOK_LOG_DEFAULT = '/home/u2065-1eiu0rm0tuqz/li-webhook-log.jsonl';
const LI_WEBHOOK_MAX_BODY_BYTES = 262144; // 256 KB: sobra para cualquier webhook de Hotmart

/**
 * Truthiness estilo JavaScript (para replicar los `||` del original).
 * Ojo: en JS la cadena "0" es truthy, así que NO usamos el cast bool de PHP.
 */
function li_js_truthy(mixed $v): bool
{
    if ($v === null || $v === false || $v === '') {
        return false;
    }
    if (is_int($v) && $v === 0) {
        return false;
    }
    if (is_float($v) && ($v === 0.0 || is_nan($v))) {
        return false;
    }
    return true;
}

/** Primer valor truthy (estilo JS `a || b || c`). */
function li_js_or(mixed ...$values): mixed
{
    $last = null;
    foreach ($values as $v) {
        $last = $v;
        if (li_js_truthy($v)) {
            return $v;
        }
    }
    return $last;
}

/** Lee un header HTTP de la request de forma case-insensitive. */
function li_request_header(string $name): ?string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$key]) && is_string($_SERVER[$key])) {
        return $_SERVER[$key];
    }
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $k => $v) {
                if (strcasecmp((string) $k, $name) === 0 && is_string($v)) {
                    return $v;
                }
            }
        }
    }
    return null;
}

/**
 * Registra SIEMPRE una línea JSON por evento recibido (append).
 * Nunca rompe la respuesta al webhook si el log falla.
 */
function li_log_event(array $record): void
{
    $path = li_cfg('LI_WEBHOOK_LOG_PATH') ?? LI_WEBHOOK_LOG_DEFAULT;
    $record = ['ts' => gmdate('Y-m-d\TH:i:s\Z')] + $record;
    $line = json_encode(
        $record,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR
    );
    if ($line === false) {
        $line = json_encode(['ts' => gmdate('Y-m-d\TH:i:s\Z'), 'error' => 'log_encode_failed']);
    }
    if (is_string($line)) {
        @file_put_contents($path, $line . "\n", FILE_APPEND | LOCK_EX);
    }
}

/** Termina la request con el mismo shape que la función JS original. */
function li_respond(int $status, string $body, string $contentType = 'text/plain; charset=utf-8'): never
{
    http_response_code($status);
    header('Content-Type: ' . $contentType);
    echo $body;
    exit;
}

/**
 * Ejecuta todas las notificaciones "en paralelo" con curl_multi
 * (equivalente al Promise.allSettled del original: los errores de un
 * canal no afectan a los demás ni a la respuesta a Hotmart).
 *
 * @param array<int, array{url:string, headers:array<int,string>, body:string}> $requests
 * @return array<int, array{ok:bool, http_code:int, error:?string}>
 */
function li_send_notifications(array $requests): array
{
    $results = [];
    if ($requests === []) {
        return $results;
    }

    $multi = curl_multi_init();
    $handles = [];

    foreach ($requests as $i => $req) {
        $ch = curl_init($req['url']);
        if ($ch === false) {
            $results[$i] = ['ok' => false, 'http_code' => 0, 'error' => 'curl_init_failed'];
            continue;
        }
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $req['body'],
            CURLOPT_HTTPHEADER     => $req['headers'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
        ]);
        $handles[$i] = $ch;
        curl_multi_add_handle($multi, $ch);
    }

    do {
        $mrc = curl_multi_exec($multi, $active);
        if ($active) {
            curl_multi_select($multi, 1.0);
        }
    } while ($active && $mrc === CURLM_OK);

    foreach ($handles as $i => $ch) {
        $errno = curl_errno($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $results[$i] = [
            'ok'        => $errno === 0 && $code >= 200 && $code < 300,
            'http_code' => $code,
            'error'     => $errno !== 0 ? curl_error($ch) : null,
        ];
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
    }
    curl_multi_close($multi);

    return $results;
}

// ---------------------------------------------------------------------------
// 0. Solo POST (la función JS solo exporta onRequestPost)
// ---------------------------------------------------------------------------
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($method !== 'POST') {
    li_respond(405, 'Method Not Allowed');
}

// ---------------------------------------------------------------------------
// 1. Validar token de Hotmart (anti-falsificación) — misma lógica que el JS:
//    solo se valida si HOTMART_WEBHOOK_TOKEN está configurado.
// ---------------------------------------------------------------------------
$expectedToken = li_cfg('HOTMART_WEBHOOK_TOKEN');
if ($expectedToken !== null && $expectedToken !== '') {
    $headerToken = li_request_header('x-hotmart-hottok');
    if ($headerToken === null || !hash_equals($expectedToken, $headerToken)) {
        li_log_event([
            'endpoint' => 'hotmart-webhook',
            'result'   => 'unauthorized',
            'ip'       => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
        li_respond(401, 'Unauthorized');
    }
}

// ---------------------------------------------------------------------------
// 2. Parsear payload JSON
// ---------------------------------------------------------------------------
$rawBody = file_get_contents('php://input', false, null, 0, LI_WEBHOOK_MAX_BODY_BYTES + 1);
if ($rawBody === false || strlen($rawBody) > LI_WEBHOOK_MAX_BODY_BYTES) {
    li_log_event([
        'endpoint' => 'hotmart-webhook',
        'result'   => 'bad_request_oversize',
        'ip'       => $_SERVER['REMOTE_ADDR'] ?? null,
    ]);
    li_respond(400, 'Bad Request');
}
$payload = json_decode($rawBody, true, 64);
if (!is_array($payload)) {
    li_log_event([
        'endpoint' => 'hotmart-webhook',
        'result'   => 'bad_request',
        'ip'       => $_SERVER['REMOTE_ADDR'] ?? null,
        'raw'      => is_string($rawBody) ? substr($rawBody, 0, 2000) : null,
    ]);
    li_respond(400, 'Bad Request');
}

// ---------------------------------------------------------------------------
// 3. Solo notificar compras aprobadas/completas (mismo filtro que el JS)
// ---------------------------------------------------------------------------
$event  = li_js_or($payload['event'] ?? null, $payload['id'] ?? null);
$status = li_js_or($payload['data']['purchase']['status'] ?? null, $payload['status'] ?? null);

$eventStr  = is_scalar($event) ? (string) $event : '';
$statusStr = is_scalar($status) ? (string) $status : '';

$isPurchase =
    preg_match('/PURCHASE.*APPROVED|PURCHASE.*COMPLETE/i', $eventStr) === 1 ||
    preg_match('/APPROVED|COMPLETE/i', $statusStr) === 1;

if (!$isPurchase) {
    li_log_event([
        'endpoint' => 'hotmart-webhook',
        'result'   => 'ignored',
        'event'    => $eventStr !== '' ? $eventStr : null,
        'status'   => $statusStr !== '' ? $statusStr : null,
        'payload'  => $payload,
    ]);
    li_respond(200, 'ignored');
}

// ---------------------------------------------------------------------------
// 4. Construir mensaje (mismos campos y formato que el JS)
// ---------------------------------------------------------------------------
$buyer    = is_array($payload['data']['buyer'] ?? null) ? $payload['data']['buyer'] : [];
$purchase = is_array($payload['data']['purchase'] ?? null) ? $payload['data']['purchase'] : [];
$product  = is_array($payload['data']['product'] ?? null) ? $payload['data']['product'] : [];

$amount   = li_js_or($purchase['price']['value'] ?? null, $purchase['full_price']['value'] ?? null, 0);
$currency = li_js_or($purchase['price']['currency_value'] ?? null, 'USD');

$buyerName    = li_js_or($buyer['name'] ?? null, 'Comprador');
$buyerCountry = li_js_or($buyer['country'] ?? null, '?');
$buyerEmail   = li_js_or($buyer['email'] ?? null, '—');
$buyerPhone   = li_js_or($buyer['checkout_phone'] ?? null, '—');
$productName  = li_js_or($product['name'] ?? null, 'el curso');

$amountStr   = is_scalar($amount) ? (string) $amount : '0';
$currencyStr = is_scalar($currency) ? (string) $currency : 'USD';

$messageTitle = "\u{1F389} Nueva venta — Loncheras Inteligentes";
$messageText  =
    '*' . (is_scalar($buyerName) ? (string) $buyerName : 'Comprador') . '* ' .
    '(' . (is_scalar($buyerCountry) ? (string) $buyerCountry : '?') . ') compró ' .
    (is_scalar($productName) ? (string) $productName : 'el curso') .
    ' — ' . $currencyStr . ' ' . $amountStr . "\n" .
    "\u{1F4E7} " . (is_scalar($buyerEmail) ? (string) $buyerEmail : '—') . "\n" .
    "\u{1F4F1} " . (is_scalar($buyerPhone) ? (string) $buyerPhone : '—');

// ISO 8601 con milisegundos, igual que Date.toISOString()
$messageTimestamp = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
    ->format('Y-m-d\TH:i:s.v\Z');

// ---------------------------------------------------------------------------
// 5. Notificar a Slack / Discord / Email (canal sin clave => se salta)
// ---------------------------------------------------------------------------
$requests = [];
$channels = [];

$slackUrl = li_cfg('SLACK_WEBHOOK_URL');
if ($slackUrl !== null && $slackUrl !== '') {
    $requests[] = [
        'url'     => $slackUrl,
        'headers' => ['Content-Type: application/json'],
        'body'    => (string) json_encode(
            ['text' => '*' . $messageTitle . "*\n" . $messageText],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ),
    ];
    $channels[] = 'slack';
}

$discordUrl = li_cfg('DISCORD_WEBHOOK_URL');
if ($discordUrl !== null && $discordUrl !== '') {
    $requests[] = [
        'url'     => $discordUrl,
        'headers' => ['Content-Type: application/json'],
        'body'    => (string) json_encode(
            [
                'embeds' => [[
                    'title'       => $messageTitle,
                    'description' => $messageText,
                    'color'       => 0x56b221,
                    'timestamp'   => $messageTimestamp,
                ]],
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ),
    ];
    $channels[] = 'discord';
}

$resendKey = li_cfg('RESEND_API_KEY');
$notifyEmail = li_cfg('NOTIFICATION_EMAIL');
if ($resendKey !== null && $resendKey !== '' && $notifyEmail !== null && $notifyEmail !== '') {
    $requests[] = [
        'url'     => 'https://api.resend.com/emails',
        'headers' => [
            'Authorization: Bearer ' . $resendKey,
            'Content-Type: application/json',
        ],
        'body'    => (string) json_encode(
            [
                'from'    => 'ventas@academiacomidareal.com',
                'to'      => $notifyEmail,
                'subject' => $messageTitle,
                'text'    => $messageText,
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ),
    ];
    $channels[] = 'resend';
}

$results = li_send_notifications($requests);

// ---------------------------------------------------------------------------
// 6. Registrar SIEMPRE la compra en el log (aunque no haya canales)
// ---------------------------------------------------------------------------
$channelResults = [];
foreach ($channels as $i => $name) {
    $channelResults[$name] = $results[$i] ?? ['ok' => false, 'http_code' => 0, 'error' => 'not_sent'];
}

li_log_event([
    'endpoint'  => 'hotmart-webhook',
    'result'    => 'purchase',
    'event'     => $eventStr !== '' ? $eventStr : null,
    'status'    => $statusStr !== '' ? $statusStr : null,
    'buyer'     => [
        'name'    => is_scalar($buyerName) ? (string) $buyerName : null,
        'email'   => is_scalar($buyerEmail) ? (string) $buyerEmail : null,
        'country' => is_scalar($buyerCountry) ? (string) $buyerCountry : null,
        'phone'   => is_scalar($buyerPhone) ? (string) $buyerPhone : null,
    ],
    'product'   => is_scalar($productName) ? (string) $productName : null,
    'amount'    => $amountStr,
    'currency'  => $currencyStr,
    'channels'  => $channelResults,
    'payload'   => $payload,
]);

// ---------------------------------------------------------------------------
// 7. Responder a Hotmart (mismo shape que el JS: {ok:true, notified:N})
//    N = canales intentados, igual que tasks.length en el original.
// ---------------------------------------------------------------------------
li_respond(
    200,
    (string) json_encode(['ok' => true, 'notified' => count($requests)]),
    'application/json; charset=utf-8'
);
