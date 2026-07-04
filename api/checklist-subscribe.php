<?php

declare(strict_types=1);

/**
 * checklist-subscribe.php — Captura de leads del funnel /checklist-diabetes/.
 * ---------------------------------------------------------------------------
 * Reemplaza al plugin Brevo de WordPress (mailin) tras el retiro de WP.
 * Replica EXACTAMENTE su flujo original (form id=1 "Checklist diabetes"):
 *   1. Alta/actualización del contacto en la lista 7 ("Checklist Diabetes").
 *   2. Envío del template transaccional 5 (entrega el checklist por correo).
 *
 * Seguridad (fail-closed):
 *   - Solo POST; Origin/Referer debe ser academiacomidareal.com.
 *   - Honeypot "website" (los bots lo llenan → 200 silencioso sin acción).
 *   - Rate limit por IP: 5 req/min (archivo fuera del webroot).
 *   - API key SOLO vía li_cfg (BREVO_API_KEY); jamás en el repo.
 */

require __DIR__ . '/_config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const CHECKLIST_LIST_ID     = 7;
const CHECKLIST_TEMPLATE_ID = 5;

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$originOk = false;
foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $h) {
    if (isset($_SERVER[$h])) {
        $host = parse_url($_SERVER[$h], PHP_URL_HOST) ?? '';
        if ($host === 'academiacomidareal.com' || $host === 'www.academiacomidareal.com'
            || $host === 'pruebas.academiacomidareal.com') {
            $originOk = true;
            if (isset($_SERVER['HTTP_ORIGIN'])) {
                header('Access-Control-Allow-Origin: https://' . $host);
                header('Vary: Origin');
            }
            break;
        }
    }
}
if (!$originOk) {
    respond(403, ['ok' => false, 'error' => 'forbidden']);
}

// Honeypot: campo invisible; si llega con contenido es un bot.
if (!empty($_POST['website'])) {
    respond(200, ['ok' => true]); // silencioso, sin acción
}

$email = trim((string) ($_POST['email'] ?? ''));
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, ['ok' => false, 'error' => 'invalid_email']);
}

// Rate limit simple por IP: máx 5/min.
$ip     = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$bucket = sys_get_temp_dir() . '/li-checklist-' . md5($ip) . '.rl';
$now    = time();
$hits   = [];
if (is_file($bucket)) {
    $hits = array_filter(
        array_map('intval', explode(',', (string) file_get_contents($bucket))),
        static fn (int $t): bool => $t > $now - 60
    );
}
if (count($hits) >= 5) {
    respond(429, ['ok' => false, 'error' => 'rate_limited']);
}
$hits[] = $now;
@file_put_contents($bucket, implode(',', $hits));

$apiKey = li_cfg('BREVO_API_KEY');
if ($apiKey === null || $apiKey === '') {
    error_log('checklist-subscribe: BREVO_API_KEY ausente en config');
    respond(503, ['ok' => false, 'error' => 'unavailable']);
}

function brevo(string $apiKey, string $path, array $payload): array
{
    $ch = curl_init('https://api.brevo.com/v3' . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => [
            'api-key: ' . $apiKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $body   = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    return ['status' => $status, 'body' => is_string($body) ? $body : ''];
}

// 1. Alta/actualización del contacto en la lista del checklist.
$contact = brevo($apiKey, '/contacts', [
    'email'         => $email,
    'listIds'       => [CHECKLIST_LIST_ID],
    'updateEnabled' => true,
]);
// 201 creado, 204 actualizado; cualquier otra cosa es fallo real.
if (!in_array($contact['status'], [201, 204], true)) {
    error_log('checklist-subscribe: alta contacto fallo HTTP ' . $contact['status']);
    respond(502, ['ok' => false, 'error' => 'subscribe_failed']);
}

// 2. Entrega del checklist (template transaccional).
$send = brevo($apiKey, '/smtp/email', [
    'templateId' => CHECKLIST_TEMPLATE_ID,
    'to'         => [['email' => $email]],
]);
if ($send['status'] !== 201) {
    error_log('checklist-subscribe: envio template fallo HTTP ' . $send['status']);
    respond(502, ['ok' => false, 'error' => 'send_failed']);
}

respond(200, [
    'ok'  => true,
    'msg' => '¡Gracias! Revisa tu correo en 2 minutos. Puede que llegue a tu bandeja de spam o promociones',
]);
