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
// PRECIO = este archivo es la fuente de verdad (la API de Hotmart NO expone el
// precio de la oferta con estos scopes: products/{id} llega vacío, offers da 500
// y sales/history viene en la moneda del comprador). Cambiar el precio aquí
// actualiza todas las páginas en <=10 min (TTL del cache).
// api_id = ID numérico del producto en la API (distinto del código de checkout).
$LI_PRODUCTS = [
    'K100999555X' => ['price' => 30, 'name' => 'Loncheras Inteligentes',          'api_id' => '5941795', 'floor1200' => true,  'checkout' => 'https://pay.hotmart.com/K100999555X?checkoutMode=2'],
    'W104617434T' => ['price' => 29, 'name' => 'Curso Aprende a Leer Etiquetas',  'api_id' => '7276024', 'floor1200' => false, 'checkout' => 'https://pay.hotmart.com/W104617434T?checkoutMode=2'],
    'V102474860O' => ['price' => 39, 'name' => 'Curso SOMP',                      'api_id' => '6459322', 'floor1200' => false, 'checkout' => 'https://pay.hotmart.com/V102474860O?checkoutMode=2'],
    'G99220429O'  => ['price' => 39, 'name' => 'Adiós Diabetes',                  'api_id' => '5365849', 'floor1200' => false, 'checkout' => 'https://pay.hotmart.com/G99220429O?off=5maxp42m&checkoutMode=2'],
    'W102558319B' => ['price' => 15, 'name' => 'Cuidado de la Piel en SOMP',      'api_id' => '6490379', 'floor1200' => false, 'checkout' => 'https://pay.hotmart.com/W102558319B?checkoutMode=2'],
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
    $data = li_stats_fetch_from_hotmart($clientId, $clientSecret, $productMeta);
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
function li_stats_fetch_from_hotmart(string $clientId, string $clientSecret, array $meta): ?array
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

    // 2. Detalles del producto (nombre real + garantía). El precio NO viene
    // de la API (ver nota en $LI_PRODUCTS): se usa el del catálogo local.
    $product = null;
    $prodRes = li_http_request(
        'GET',
        'https://developers.hotmart.com/products/api/v1/products?id=' . rawurlencode($meta['api_id']),
        $bearer,
        null,
        8
    );
    if ($prodRes !== null && $prodRes['status'] >= 200 && $prodRes['status'] < 300) {
        $decoded = json_decode($prodRes['body'], true);
        if (is_array($decoded) && !empty($decoded['items'][0]) && is_array($decoded['items'][0])) {
            $product = $decoded['items'][0];
        }
    }

    // 3. Ventas de los últimos 12 meses → estudiantes únicos por email.
    $sinceMs  = (time() - 365 * 24 * 60 * 60) * 1000; // epoch en ms, como el JS
    $students = $meta['floor1200'] ? 1200 : 0;
    $salesRes = li_http_request(
        'GET',
        'https://developers.hotmart.com/payments/api/v1/sales/history'
            . '?product_id=' . rawurlencode($meta['api_id'])
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
            $students = $meta['floor1200'] ? max(count($emails), 1200) : count($emails);
        }
    }

    // Precio: 1º el checkout público de Hotmart (única fuente que refleja al
    // instante lo que el Dr. configure), 2º el catálogo local como respaldo.
    $price    = li_stats_price_from_checkout($meta['checkout']) ?? $meta['price'];
    $currency = 'USD';
    $name = $product['name'] ?? null;
    if (!is_string($name) || $name === '') {
        $name = $meta['name'];
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


/**
 * Lee el precio USD del payload embebido en la página pública del checkout.
 * El servidor (EE.UU.) recibe la vista en USD. Patrón del payload (Nuxt):
 *   {"value":N,"currency":M,...},<precio>,"USD"
 * Devuelve null si no puede extraer un precio sano (5..500 USD).
 */
function li_stats_price_from_checkout(string $checkoutUrl): ?float
{
    $res = li_http_request('GET', $checkoutUrl, ['User-Agent: Mozilla/5.0'], null, 8);
    if ($res === null || $res['status'] < 200 || $res['status'] >= 400) {
        return null;
    }
    if (!preg_match('/"value":\d+,"currency":\d+[^}]*\},([0-9]+(?:\.[0-9]+)?),"USD"/', $res['body'], $m)) {
        return null;
    }
    $price = (float) $m[1];
    if ($price < 5 || $price > 500) {
        return null; // fuera de rango sano: no confiar en el scrape
    }
    return $price === floor($price) ? (float) (int) $price : $price;
}
