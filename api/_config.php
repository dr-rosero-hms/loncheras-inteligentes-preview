<?php

declare(strict_types=1);

/**
 * _config.php — Config compartida de los endpoints PHP (SiteGround).
 * --------------------------------------------------------------------
 * Contrato:
 *   - Cada endpoint hace: require __DIR__ . '/_config.php';
 *   - li_cfg(string $key): ?string resuelve claves en este orden:
 *       1. /home/u2065-1eiu0rm0tuqz/rosero-api-config.php (return de array
 *          asociativo, FUERA del webroot — el repo NUNCA contiene ese archivo)
 *       2. getenv($key)
 *       3. null
 *   - JAMÁS credenciales hardcodeadas aquí ni en los endpoints.
 *
 * Este archivo está bloqueado por .htaccess (Require all denied): nunca se
 * sirve directo por HTTP.
 */

// Nunca exponer errores/stack traces al cliente (van a error_log, no al body).
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');

if (!defined('LI_CONFIG_FILE')) {
    define('LI_CONFIG_FILE', '/home/u2065-1eiu0rm0tuqz/rosero-api-config.php');
}

if (!function_exists('li_cfg')) {
    /**
     * Devuelve el valor de configuración para $key, o null si no existe.
     */
    function li_cfg(string $key): ?string
    {
        static $config = null;

        if ($config === null) {
            $config = [];
            if (is_file(LI_CONFIG_FILE) && is_readable(LI_CONFIG_FILE)) {
                $loaded = require LI_CONFIG_FILE;
                if (is_array($loaded)) {
                    $config = $loaded;
                }
            }
        }

        if (array_key_exists($key, $config)
            && $config[$key] !== null
            && $config[$key] !== ''
        ) {
            return (string) $config[$key];
        }

        $env = getenv($key);
        if ($env !== false && $env !== '') {
            return $env;
        }

        return null;
    }
}

if (!function_exists('li_http_request')) {
    /**
     * Helper HTTP compartido (curl). Timeouts acotados por contrato:
     * CURLOPT_TIMEOUT <= 8, CURLOPT_CONNECTTIMEOUT <= 4.
     *
     * @param array<int, string> $headers Headers formato "Nombre: valor".
     * @return array{status:int, body:string}|null null en error de red.
     */
    function li_http_request(
        string $method,
        string $url,
        array $headers = [],
        ?string $body = null,
        int $timeoutSeconds = 8
    ): ?array {
        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT        => max(1, min($timeoutSeconds, 8)),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT      => 'li-api-php/1.0 (+SiteGround)',
        ]);

        $method = strtoupper($method);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($body !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }
        } elseif ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if ($body !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }
        }

        $responseBody = curl_exec($ch);
        if ($responseBody === false) {
            return null;
        }

        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

        return ['status' => $status, 'body' => (string) $responseBody];
    }
}

if (!function_exists('li_json_response')) {
    /**
     * Emite $data como JSON (misma presentación que el original de
     * Cloudflare Pages: pretty-print, charset utf-8, CORS abierto) y termina.
     *
     * @param array<string, mixed> $data
     */
    function li_json_response(array $data, int $cacheSeconds = 60, int $httpStatus = 200): never
    {
        http_response_code($httpStatus);
        header('Content-Type: application/json; charset=utf-8');
        header(sprintf('Cache-Control: public, max-age=%d, s-maxage=%d', $cacheSeconds, $cacheSeconds));
        header('Access-Control-Allow-Origin: *');

        $json = json_encode(
            $data,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        );

        echo $json === false ? '{}' : $json;
        exit;
    }
}
