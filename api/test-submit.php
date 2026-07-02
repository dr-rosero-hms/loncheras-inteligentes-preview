<?php

declare(strict_types=1);

/**
 * /api/test-submit.php — Port PHP 8.2 (SiteGround) de la Cloudflare Pages
 * Function functions/api/test-submit.js (Loncheras Inteligentes).
 *
 * Procesa el envío del Test 3+1 extendido:
 *   1. Validación server-side (mismos enums y límites que el JS)
 *   2. Persistencia ANTI-PÉRDIDA del lead en JSONL (fuera del webroot)
 *      ANTES de intentar cualquier integración externa
 *   3. Cálculo del diagnóstico (misma lógica que el cliente)
 *   4. Brevo: upsert de contacto en lista + email transaccional
 *   5. Make.com: webhook de orquestación
 *
 * Config via li_cfg() (ver _config.php, creado por otro agente):
 *   - BREVO_API_KEY        (xkeysib-...)
 *   - BREVO_LIST_ID        (id de lista en Brevo, ej. "5")
 *   - BREVO_SENDER_EMAIL   (default: oscar@academiacomidareal.com)
 *   - BREVO_SENDER_NAME    (default: Dr. Oscar Rosero)
 *   - MAKE_WEBHOOK_URL     (https://hook.eu1.make.com/...)
 *   - LI_LEADS_LOG_PATH    (opcional; default /home/u2065-1eiu0rm0tuqz/li-leads-log.jsonl)
 *
 * Si Brevo/Make no están configurados o fallan, el endpoint IGUAL responde
 * éxito (el lead ya quedó persistido en el JSONL). El shape de respuesta
 * replica el del JS ({ success, score, titulo, email_sent }) y agrega
 * "delivered" — campo extra que el consumidor (scripts/test-extended.js)
 * ignora sin romperse, porque solo lee json.email_sent.
 */

require __DIR__ . '/_config.php';

// Fallback defensivo: si _config.php cambió y no define li_cfg(), degradar a getenv.
if (!function_exists('li_cfg')) {
    function li_cfg(string $key): ?string
    {
        $v = getenv($key);
        return ($v === false || $v === '') ? null : $v;
    }
}

const LI_LEADS_LOG_DEFAULT = '/home/u2065-1eiu0rm0tuqz/li-leads-log.jsonl';
const LI_MAX_BODY_BYTES    = 65536; // 64 KB: sobra para 8 campos cortos
const LI_MAX_NAME_CHARS    = 80;    // mismo slice(0, 80) del JS
const LI_MAX_EMAIL_CHARS   = 200;   // mismo slice(0, 200) del JS

const LI_ENUMS = [
    'proteina'   => ['huevo', 'pollo', 'carne', 'queso', 'atun', 'jamon', 'ninguna'],
    'carbo'      => ['arepa', 'yuca', 'tortilla', 'galleta-arroz', 'pan-procesado', 'ninguno'],
    'vegetal'    => ['tomate', 'aguacate', 'lechuga', 'fruta', 'jugo', 'ninguno'],
    'hidrata'    => ['agua', 'agua-limon', 'jugo-caja', 'gaseosa', 'ninguna'],
    'frecuencia' => ['nunca', '1-2', '3-4', 'diario'],
    'edad'       => ['0-5', '5-10', '10-15', 'adulto'],
];

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('X-Content-Type-Options: nosniff');

$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if ($method !== 'POST') {
    header('Allow: POST, OPTIONS');
    li_respond(['error' => 'method not allowed'], 405);
}

// ---------- 0. Leer y parsear body (equivalente a request.json()) ----------
$rawBody = file_get_contents('php://input', false, null, 0, LI_MAX_BODY_BYTES + 1);
if ($rawBody === false || $rawBody === '' || strlen($rawBody) > LI_MAX_BODY_BYTES) {
    li_respond(['error' => 'bad request'], 400);
}

$body = json_decode($rawBody, true, 16);
if (json_last_error() !== JSON_ERROR_NONE) {
    li_respond(['error' => 'bad request'], 400);
}
if (!is_array($body)) {
    // JSON válido pero no objeto (ej. "texto"): el JS seguiría y fallaría en
    // el primer enum con 400 "Invalid proteina" — replicamos con array vacío.
    $body = [];
}

// ---------- 1. Validar (mismos campos, formatos y límites del JS) ----------
$data = [];
foreach (LI_ENUMS as $k => $allowed) {
    $v = $body[$k] ?? null;
    if (!is_string($v) || !in_array($v, $allowed, true)) {
        li_respond(['error' => "Invalid {$k}"], 400);
    }
    $data[$k] = $v;
}

$data['name']  = li_clean_str($body['name'] ?? '', LI_MAX_NAME_CHARS);
$data['email'] = mb_strtolower(li_clean_str($body['email'] ?? '', LI_MAX_EMAIL_CHARS), 'UTF-8');
if ($data['email'] !== '' && filter_var($data['email'], FILTER_VALIDATE_EMAIL) === false) {
    li_respond(['error' => 'Invalid email'], 400);
}

// ---------- 2. Calcular diagnóstico (misma lógica que el cliente) ----------
$dx = li_diagnose($data);

// ---------- 3. ANTI-PÉRDIDA: persistir el lead ANTES de Brevo/Make ----------
$persisted = li_persist_lead($data, $dx);

// ---------- 4. Brevo (si hay credenciales) ----------
$emailSent      = false;
$brevoContactOk = false;
$brevoApiKey    = li_cfg('BREVO_API_KEY');

if ($data['email'] !== '' && $brevoApiKey !== null && $brevoApiKey !== '') {
    $brevoHeaders = [
        'api-key: ' . $brevoApiKey,
        'accept: application/json',
    ];

    // 4a. Add/update contacto en lista
    $listIdRaw = li_cfg('BREVO_LIST_ID');
    $listIds   = [];
    if ($listIdRaw !== null && (int) $listIdRaw > 0) {
        $listIds[] = (int) $listIdRaw;
    }
    [$contactStatus] = li_http_post_json('https://api.brevo.com/v3/contacts', $brevoHeaders, [
        'email'      => $data['email'],
        'attributes' => [
            'FIRSTNAME'             => $data['name'],
            'TEST_SCORE'            => $dx['score'],
            'TEST_URGENCIA'         => $dx['urgencia'],
            'EDAD'                  => $data['edad'],
            'FRECUENCIA_PROCESADOS' => $data['frecuencia'],
        ],
        'listIds'       => $listIds,
        'updateEnabled' => true,
    ]);
    $brevoContactOk = ($contactStatus >= 200 && $contactStatus < 300);

    // 4b. Email transaccional con el diagnóstico
    $senderEmail = li_cfg('BREVO_SENDER_EMAIL') ?? 'oscar@academiacomidareal.com';
    $senderName  = li_cfg('BREVO_SENDER_NAME') ?? 'Dr. Oscar Rosero';
    [$emailStatus] = li_http_post_json('https://api.brevo.com/v3/smtp/email', $brevoHeaders, [
        'sender'      => ['email' => $senderEmail, 'name' => $senderName],
        'to'          => [['email' => $data['email'], 'name' => ($data['name'] !== '' ? $data['name'] : $data['email'])]],
        'subject'     => "Tu diagnóstico Regla 3+1: {$dx['score']}/4 — {$dx['titulo']}",
        'htmlContent' => li_build_email_html($data, $dx),
    ]);
    $emailSent = ($emailStatus >= 200 && $emailStatus < 300);
}

// ---------- 5. Make.com webhook (orquestación) ----------
$makeOk  = false;
$makeUrl = li_cfg('MAKE_WEBHOOK_URL');

if ($makeUrl !== null && $makeUrl !== ''
    && filter_var($makeUrl, FILTER_VALIDATE_URL) !== false
    && str_starts_with($makeUrl, 'https://')
) {
    $fallosTitulos = array_map(
        static fn(array $f): string => $f['titulo'],
        $dx['fallos']
    );
    [$makeStatus] = li_http_post_json($makeUrl, [], [
        'event'        => 'test_3plus1_completed',
        'submitted_at' => gmdate('Y-m-d\TH:i:s\Z'),
        'score'        => $dx['score'],
        'urgencia'     => $dx['urgencia'],
        'contact'      => ['name' => $data['name'], 'email' => $data['email']],
        'answers'      => [
            'proteina'   => $data['proteina'],
            'carbo'      => $data['carbo'],
            'vegetal'    => $data['vegetal'],
            'hidrata'    => $data['hidrata'],
            'frecuencia' => $data['frecuencia'],
            'edad'       => $data['edad'],
        ],
        'diagnosis'    => [
            'titulo'  => $dx['titulo'],
            'resumen' => $dx['resumen'],
            'fallos'  => $fallosTitulos,
        ],
    ]);
    $makeOk = ($makeStatus >= 200 && $makeStatus < 300);
}

// ---------- 6. Respuesta (mismo shape que el JS + "delivered" extra) ----------
// El consumidor (scripts/test-extended.js) solo lee json.email_sent, así que
// el campo extra "delivered" no rompe nada. El lead ya está en el JSONL:
// success=true aunque Brevo/Make fallen.
li_respond([
    'success'    => true,
    'score'      => $dx['score'],
    'titulo'     => $dx['titulo'],
    'email_sent' => $emailSent,
    'delivered'  => ($emailSent || $brevoContactOk || $makeOk),
]);

// ======================================================================
// Helpers
// ======================================================================

/**
 * Emite JSON (pretty-print, igual que JSON.stringify(data, null, 2)) y termina.
 */
function li_respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode(
        $payload,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

/**
 * Normaliza un valor arbitrario del body a string acotado:
 * equivalente a (v || "").toString().slice(0, max).trim() del JS.
 * Valores no escalares (arrays/objetos) se descartan a "".
 */
function li_clean_str(mixed $v, int $maxChars): string
{
    if (!is_scalar($v)) {
        return '';
    }
    $s = (string) $v;
    // Quitar bytes de control (defensa extra sobre el JS original)
    $s = preg_replace('/[\x00-\x1F\x7F]/u', '', $s) ?? '';
    return trim(mb_substr($s, 0, $maxChars, 'UTF-8'));
}

/**
 * Lógica de diagnóstico — réplica 1:1 de diagnose() del JS.
 *
 * @param array{proteina:string,carbo:string,vegetal:string,hidrata:string,frecuencia:string,edad:string,name:string,email:string} $data
 * @return array{score:int,titulo:string,resumen:string,fallos:list<array{titulo:string,msg:string}>,urgencia:string}
 */
function li_diagnose(array $data): array
{
    $checks = [
        'proteina' => ($data['proteina'] !== 'ninguna'),
        'carbo'    => (!in_array($data['carbo'], ['pan-procesado', 'ninguno'], true)),
        'vegetal'  => (!in_array($data['vegetal'], ['jugo', 'ninguno'], true)),
        'hidrata'  => (in_array($data['hidrata'], ['agua', 'agua-limon'], true)),
    ];
    $score = count(array_filter($checks));

    $falta = [
        'proteina' => ['titulo' => 'Falta proteína', 'msg' => 'Sin proteína no hay saciedad real.'],
        'carbo'    => ['titulo' => 'Falta carbohidrato real', 'msg' => 'Arepa, yuca o papa — no pan ni galleta procesada.'],
        'vegetal'  => ['titulo' => 'Falta vegetal o fruta', 'msg' => 'Una porción del tamaño de una unidad o una taza.'],
        'hidrata'  => ['titulo' => 'Hidratación incorrecta', 'msg' => 'Agua, agua con limón o té sin azúcar — cero jugos ni gaseosas.'],
    ];
    $fallos = [];
    foreach ($checks as $k => $ok) {
        if (!$ok) {
            $fallos[] = $falta[$k];
        }
    }

    $urgencia = 'normal';
    if ($score === 4) {
        $titulo  = 'La regla del 3+1 nunca falla';
        $resumen = 'Cumples las 4 piezas. Loncheras 100% nutritivas.';
    } elseif ($score === 3) {
        $titulo  = 'Casi. Te falta una pieza';
        $resumen = '1 proteína + 1 carbohidrato + 1 vegetal/fruta + 1 hidratación.';
    } elseif ($score === 2) {
        $titulo  = 'Lonchera incompleta';
        $resumen = 'Faltan 2 piezas. Tu hijo va a llegar al recreo con hambre.';
    } elseif ($score === 1) {
        $titulo   = 'Lonchera con riesgo metabólico';
        $resumen  = 'Pico de insulina, hipoglucemia 1 hora después, antojo de azúcar.';
        $urgencia = 'alta';
    } else {
        $titulo   = 'Esto no es una lonchera';
        $resumen  = 'Los ultraprocesados son los enemigos.';
        $urgencia = 'alta';
    }

    return [
        'score'    => $score,
        'titulo'   => $titulo,
        'resumen'  => $resumen,
        'fallos'   => $fallos,
        'urgencia' => $urgencia,
    ];
}

/**
 * ANTI-PÉRDIDA: append del lead como línea JSON al log fuera del webroot.
 * Se ejecuta SIEMPRE antes de Brevo/Make. Nunca lanza: si falla, se registra
 * en error_log y el flujo continúa (best effort, no bloquea al usuario).
 */
function li_persist_lead(array $data, array $dx): bool
{
    $logPath = li_cfg('LI_LEADS_LOG_PATH') ?? LI_LEADS_LOG_DEFAULT;

    $record = [
        'received_at' => gmdate('Y-m-d\TH:i:s\Z'),
        'event'       => 'test_3plus1_completed',
        'name'        => $data['name'],
        'email'       => $data['email'],
        'answers'     => [
            'proteina'   => $data['proteina'],
            'carbo'      => $data['carbo'],
            'vegetal'    => $data['vegetal'],
            'hidrata'    => $data['hidrata'],
            'frecuencia' => $data['frecuencia'],
            'edad'       => $data['edad'],
        ],
        'score'       => $dx['score'],
        'urgencia'    => $dx['urgencia'],
        'titulo'      => $dx['titulo'],
        'ip'          => (isset($_SERVER['REMOTE_ADDR']) && is_string($_SERVER['REMOTE_ADDR']))
            ? substr($_SERVER['REMOTE_ADDR'], 0, 45)
            : null,
    ];

    $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line === false) {
        error_log('[li-leads] json_encode failed');
        return false;
    }

    $written = @file_put_contents($logPath, $line . "\n", FILE_APPEND | LOCK_EX);
    if ($written === false) {
        error_log('[li-leads] cannot append to leads log: ' . $logPath);
        return false;
    }
    return true;
}

/**
 * POST JSON con curl. Timeouts del contrato: TIMEOUT <= 8, CONNECTTIMEOUT <= 4.
 *
 * @param list<string> $extraHeaders
 * @return array{0:int,1:string} [statusCode (0 si falló el transporte), body]
 */
function li_http_post_json(string $url, array $extraHeaders, array $payload): array
{
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return [0, ''];
    }

    $ch = curl_init($url);
    if ($ch === false) {
        return [0, ''];
    }

    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $json,
        CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json'], $extraHeaders),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
    ]);

    $respBody = curl_exec($ch);
    if ($respBody === false) {
        // No loguear la URL completa: los webhooks de Make llevan token en el path.
        $host = parse_url($url, PHP_URL_HOST) ?: 'unknown-host';
        error_log('[li-http] ' . curl_error($ch) . ' host=' . $host);
        curl_close($ch);
        return [0, ''];
    }

    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$status, is_string($respBody) ? $respBody : ''];
}

/**
 * Escape HTML — equivalente al esc() del JS (&, <, >, ", ').
 */
function li_esc(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * HTML del email transaccional — réplica 1:1 de buildEmailHTML() del JS.
 */
function li_build_email_html(array $data, array $dx): string
{
    $fallosHtml = '';
    foreach ($dx['fallos'] as $f) {
        $fallosHtml .= '<li><strong>' . li_esc($f['titulo']) . '.</strong> ' . li_esc($f['msg']) . '</li>';
    }
    $greeting = ($data['name'] !== '') ? 'Hola ' . li_esc($data['name']) . ',' : 'Hola,';

    $score      = (int) $dx['score'];
    $tituloEsc  = li_esc($dx['titulo']);
    $resumenEsc = li_esc($dx['resumen']);

    $fallosBlock = $fallosHtml !== ''
        ? '<h3 style="margin:24px 0 12px;font-size:16px">Lo que necesitas corregir:</h3><ul style="padding-left:20px">' . $fallosHtml . '</ul>'
        : '<p style="margin:24px 0;font-size:16px"><strong>¡Excelente!</strong> Sigue así. La fórmula 3+1 nunca falla.</p>';

    return <<<HTML
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Diagnóstico Regla 3+1</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#0f172a;line-height:1.55">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#fff">
    <div style="text-align:center;padding-bottom:24px;border-bottom:2px solid #56b221">
      <h1 style="margin:0;font-size:22px;color:#0f172a">Tu diagnóstico Regla 3+1</h1>
      <p style="margin:6px 0 0;color:#475569;font-size:14px">Dr. Oscar Rosero · Médico Endocrinólogo</p>
    </div>

    <p style="margin-top:24px">{$greeting}</p>
    <p>Tu lonchera obtuvo <strong style="color:#56b221;font-size:18px">{$score} / 4</strong> piezas de la Regla 3+1.</p>

    <div style="background:#eafaee;border-left:4px solid #56b221;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
      <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a">{$tituloEsc}</h2>
      <p style="margin:0;color:#0f172a">{$resumenEsc}</p>
    </div>

    {$fallosBlock}

    <h3 style="margin:32px 0 12px;font-size:16px">¿Qué sigue?</h3>
    <p>El curso completo "Loncheras Inteligentes" tiene 14 módulos en video, 11 recetas paso a paso, y los 2 bonos exclusivos (lectura de etiquetas + crecimiento infantil).</p>

    <p style="text-align:center;margin:32px 0">
      <a href="https://pay.hotmart.com/K100999555X" style="display:inline-block;background:#56b221;color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;font-size:14px">Inscribirme — \$30 USD</a>
    </p>

    <p style="font-size:13px;color:#64748b;margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0">
      <em>"La comida real nos va a sanar."</em><br>
      — Dr. Oscar Rosero
    </p>

    <p style="font-size:11px;color:#94a3b8;margin-top:24px">
      Recibes este email porque completaste el Test 3+1 en
      <a href="https://academiacomidareal.com/cursoloncheras/" style="color:#94a3b8">academiacomidareal.com</a>.
      Si no quieres recibir más emails, <a href="{{params.unsubscribe}}" style="color:#94a3b8">aquí te das de baja</a>.
    </p>
  </div>
</body></html>
HTML;
}
