<?php

declare(strict_types=1);

/**
 * /api/hotmart-stats — Port PHP de la Cloudflare Pages Function homónima.
 * ------------------------------------------------------------------------
 * Sincroniza precio + cantidad de estudiantes desde Hotmart.
 * La forma del JSON es IDÉNTICA a la del original JS: la consume
 * cursoloncheras/scripts/price-sync.js (lee price_usd y students).
 *
 * Cascada:
 *   a. Cache de archivo (TTL 10 min) → respuesta directa.
 *   b. Credenciales Hotmart vía li_cfg → OAuth client_credentials +
 *      producto + historial de ventas (misma lógica del JS original).
 *   c. Proxy GET a https://loncheras-inteligentes.pages.dev/api/hotmart-stats
 *      (timeout 5s), JSON tal cual con source reetiquetado a "proxy-pages".
 *   d. Fallback estático (no se cachea).
 *
 * Se cachea el resultado de (b) o (c); nunca el de (d).
 * Credenciales: SIEMPRE vía li_cfg (archivo fuera del webroot o env). Nada
 * hardcodeado en este archivo.
 */

require __DIR__ . '/_config.php';

const LI_STATS_CACHE_TTL = 600; // 10 minutos

// Solo GET/HEAD (el original era onRequestGet).
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    li_json_response(['error' => 'method_not_allowed'], 0, 405);
}

// Multi-producto: ?product=<ID> con lista blanca (los 5 productos del sitio).
// Sin parámetro = Loncheras (compatibilidad con price-sync.js original).
$LI_PRODUCTS = [
    'K100999555X' => ['price' => 30, 'name' => 'Loncheras Inteligentes'],
    'W104617434T' => ['price' => 29, 'name' => 'Curso Aprende a Leer Etiquetas'],
    'V102474860O' => ['price' => 39, 'name' => 'Curso SOMP'],
    'G99220429O'  => ['price' => 39, 'name' => 'Adiós Diabetes'],
    'W102558319B' => ['price' => 15, 'name' => 'Cuidado de la Piel en SOMP'],
];
$reqProduct = (string) ($_GET['product'] ?? '');
if ($reqProduct !== '' && !isset($LI_PRODUCTS[$reqProduct])) {
    li_json_response(['error' => 'unknown_product'], 0, 404);
}
$productId = $reqProduct !== '' ? $reqProduct : (li_cfg('HOTMART_PRODUCT_ID') ?? 'K100999555X');
$productMeta = $LI_PRODUCTS[$productId] ?? ['price' => 30, 'name' => 'Loncheras Inteligentes'];

// Cache FUERA del webroot y fuera del /tmp compartido (nombre predecible en
// /tmp = riesgo de envenenamiento/symlink en hosting compartido). Misma
// carpeta home que el resto de logs; configurable vía li_cfg. Un cache por producto.
$cacheBase = li_cfg('LI_STATS_CACHE_PATH')
    ?? (dirname(LI_CONFIG_FILE) . '/li-hotmart-stats-cache.json');
$cacheFile = $reqProduct !== ''
    ? preg_replace('/\.json$/', '-' . $productId . '.json', $cacheBase)
    : $cacheBase;

// ---------------------------------------------------------------------------
// a) Cache de archivo fresco → devolver directo.
// ---------------------------------------------------------------------------
$cached = li_stats_cache_read($cacheFile);
if ($cached !== null) {
    li_json_response($cached, LI_STATS_CACHE_TTL);
}

// ---------------------------------------------------------------------------
// b) API de Hotmart si hay credenciales.
// ---------------------------------------------------------------------------
$clientId     = li_cfg('HOTMART_CLIENT_ID');
$clientSecret = li_cfg('HOTMART_CLIENT_SECRET');

if ($clientId !== null && $clientSecret !== null) {
    $data = li_stats_fetch_from_hotmart($clientId, $clientSecret, $productId);
    if ($data !== null) {
        li_stats_cache_write($cacheFile, $data);
        li_json_response($data, LI_STATS_CACHE_TTL);
    }
}

// ---------------------------------------------------------------------------
// c) Proxy al endpoint original en Cloudflare Pages (timeout 5s).
// ---------------------------------------------------------------------------
$proxied = ($productId === 'K100999555X') ? li_stats_fetch_from_pages_proxy() : null;
if ($proxied !== null) {
    li_stats_cache_write($cacheFile, $proxied);
    li_json_response($proxied, LI_STATS_CACHE_TTL);
}

// ---------------------------------------------------------------------------
// d) Fallback estático — misma forma que el original. NO se cachea.
// ---------------------------------------------------------------------------
li_json_response([
    'source'       => 'fallback',
    'price_usd'    => $productMeta['price'],
    'currency'     => 'USD',
    'students'     => 1200,
    'product_name' => $productMeta['name'],
], 60);

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * Lee el cache de archivo si existe y está dentro del TTL.
 *
 * @return array<string, mixed>|null
 */
function li_stats_cache_read(string $cacheFile): ?array
{
    if (!is_file($cacheFile)) {
        return null;
    }

    $mtime = @filemtime($cacheFile);
    if ($mtime === false || (time() - $mtime) >= LI_STATS_CACHE_TTL) {
        return null;
    }

    $raw = @file_get_contents($cacheFile);
    if ($raw === false || $raw === '') {
        return null;
    }

    $decoded = json_decode($raw, true, 8);
    // Validación mínima de forma: lo que price-sync.js consume debe existir y
    // ser numérico; un cache corrupto/ajeno jamás se sirve.
    if (!is_array($decoded)
        || !isset($decoded['price_usd'], $decoded['students'])
        || !is_numeric($decoded['price_usd'])
        || !is_numeric($decoded['students'])
    ) {
        return null;
    }

    return $decoded;
}

/**
 * Persiste el payload en el cache de archivo (escritura atómica).
 *
 * @param array<string, mixed> $data
 */
function li_stats_cache_write(string $cacheFile, array $data): void
{
    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return;
    }

    $tmp = @tempnam(dirname($cacheFile), 'li-stats-');
    if ($tmp === false) {
        @file_put_contents($cacheFile, $json, LOCK_EX);
        return;
    }

    if (@file_put_contents($tmp, $json) !== false && @rename($tmp, $cacheFile)) {
        @chmod($cacheFile, 0600); // fuera del webroot: solo el dueño lo lee
        return;
    }

    @unlink($tmp);
}

/**
 * Réplica fiel del flujo del JS original contra la API de Hotmart.
 * Devuelve null solo si el paso de auth falla (igual que el `throw` del JS);
 * fallos en producto/ventas degradan a los mismos defaults del original.
 *
 * @return array<string, mixed>|null
 */
function li_stats_fetch_from_hotmart(string $clientId, string $clientSecret, string $productId): ?array
{
    // 1. Auth: access_token vía client_credentials.
    $authRes = li_http_request(
        'POST',
        'https://api-sec-vlc.hotmart.com/security/oauth/token',
        [
            'Content-Type: application/x-www-form-urlencoded',
            'Authorization: Basic ' . base64_encode($clientId . ':' . $clientSecret),
        ],
        'grant_type=client_credentials',
        8
    );

    if ($authRes === null || $authRes['status'] < 200 || $authRes['status'] >= 300) {
        return null; // equivalente al throw new Error("auth failed")
    }

    $auth  = json_decode($authRes['body'], true);
    $token = is_array($auth) ? ($auth['access_token'] ?? null) : null;
    if (!is_string($token) || $token === '') {
        return null;
    }

    $bearer = ['Authorization: Bearer ' . $token];

    // 2. Detalles del producto (precio + nombre).
    $product = null;
    $prodRes = li_http_request(
        'GET',
        'https://developers.hotmart.com/payments/api/v1/sales/products/' . rawurlencode($productId),
        $bearer,
        null,
        8
    );
    if ($prodRes !== null && $prodRes['status'] >= 200 && $prodRes['status'] < 300) {
        $decoded = json_decode($prodRes['body'], true);
        if (is_array($decoded)) {
            $product = $decoded;
        }
    }

    // 3. Ventas de los últimos 12 meses → estudiantes únicos por email.
    $sinceMs  = (time() - 365 * 24 * 60 * 60) * 1000; // epoch en ms, como el JS
    $students = 1200;
    $salesRes = li_http_request(
        'GET',
        'https://developers.hotmart.com/payments/api/v1/sales/history'
            . '?product_id=' . rawurlencode($productId)
            . '&start_date=' . $sinceMs
            . '&max_results=500',
        $bearer,
        null,
        8
    );
    if ($salesRes !== null && $salesRes['status'] >= 200 && $salesRes['status'] < 300) {
        $sales = json_decode($salesRes['body'], true);
        if (is_array($sales)) {
            $emails = [];
            foreach (($sales['items'] ?? []) as $sale) {
                if (!is_array($sale)) {
                    continue;
                }
                $email  = $sale['buyer']['email'] ?? null;
                $status = $sale['purchase']['status'] ?? null;
                if (is_string($email) && $email !== ''
                    && ($status === 'APPROVED' || $status === 'COMPLETE')
                ) {
                    $emails[strtolower($email)] = true;
                }
            }
            $students = max(count($emails), 1200);
        }
    }

    // Mismos defaults "falsy" que el JS: price 0/null → 30, etc.
    $price = $product['price']['value'] ?? null;
    if (!is_numeric($price) || (float) $price <= 0) {
        $price = 30;
    } else {
        $price = (float) $price;
        if ($price === floor($price)) {
            $price = (int) $price; // 30.0 → 30, como lo serializa JS
        }
    }

    $currency = $product['price']['currency_code'] ?? null;
    if (!is_string($currency) || $currency === '') {
        $currency = 'USD';
    }

    $name = $product['name'] ?? null;
    if (!is_string($name) || $name === '') {
        $name = 'Loncheras Inteligentes';
    }

    return [
        'source'       => 'hotmart_api',
        'price_usd'    => $price,
        'currency'     => $currency,
        'students'     => $students,
        'product_name' => $name,
        'fetched_at'   => (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'),
    ];
}

/**
 * Proxy al endpoint original en Cloudflare Pages. Devuelve su JSON tal cual;
 * si trae campo "source" se reetiqueta a "proxy-pages" (misma forma).
 *
 * @return array<string, mixed>|null
 */
function li_stats_fetch_from_pages_proxy(): ?array
{
    $res = li_http_request(
        'GET',
        'https://loncheras-inteligentes.pages.dev/api/hotmart-stats',
        ['Accept: application/json'],
        null,
        5
    );

    if ($res === null || $res['status'] < 200 || $res['status'] >= 300) {
        return null;
    }

    $decoded = json_decode($res['body'], true, 16);
    if (!is_array($decoded)) {
        return null;
    }

    if (array_key_exists('source', $decoded)) {
        $decoded['source'] = 'proxy-pages';
    }

    return $decoded;
}
