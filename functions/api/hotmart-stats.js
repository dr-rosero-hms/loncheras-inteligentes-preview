/**
 * Cloudflare Pages Function: /api/hotmart-stats
 * --------------------------------------------------------
 * Sincroniza precio + cantidad de estudiantes desde Hotmart.
 *
 * Para activar:
 *   1. Genera credenciales en Hotmart (Configuración → API y Webhooks → "Crear credencial")
 *   2. En Cloudflare Pages dashboard, añade los secrets:
 *      - HOTMART_CLIENT_ID
 *      - HOTMART_CLIENT_SECRET
 *      - HOTMART_PRODUCT_ID (= K100999555X)
 *   3. (O via CLI: `npx wrangler pages secret put HOTMART_CLIENT_ID --project-name=loncheras-inteligentes`)
 *
 * Llamadas desde el frontend:
 *   fetch('/api/hotmart-stats').then(r => r.json())
 *
 * Cache: 1h en Cloudflare cache para no saturar la API de Hotmart.
 */

export async function onRequestGet({ env, request }) {
  const cacheUrl = new URL(request.url);
  const cacheKey = new Request(cacheUrl.toString(), request);
  const cache = caches.default;

  // Intentar servir desde cache primero
  let response = await cache.match(cacheKey);
  if (response) return response;

  const clientId = env.HOTMART_CLIENT_ID;
  const clientSecret = env.HOTMART_CLIENT_SECRET;
  const productId = env.HOTMART_PRODUCT_ID || "K100999555X";

  // Si no hay credenciales, devolver datos hardcoded (fallback seguro)
  if (!clientId || !clientSecret) {
    return jsonResponse({
      source: "fallback",
      price_usd: 30,
      students: 1200,
      currency: "USD",
      _note: "Configura HOTMART_CLIENT_ID y HOTMART_CLIENT_SECRET en Cloudflare secrets para datos vivos."
    }, 60);
  }

  try {
    // 1. Auth: obtener access_token (cache 24h)
    const authRes = await fetch("https://api-sec-vlc.hotmart.com/security/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + btoa(`${clientId}:${clientSecret}`)
      },
      body: "grant_type=client_credentials"
    });
    if (!authRes.ok) throw new Error("auth failed");
    const auth = await authRes.json();
    const token = auth.access_token;

    // 2. Fetch product details (precio + stats)
    const prodRes = await fetch(
      `https://developers.hotmart.com/payments/api/v1/sales/products/${productId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const product = prodRes.ok ? await prodRes.json() : null;

    // 3. Fetch ventas para contar estudiantes únicos (últimos 12 meses)
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).getTime();
    const salesRes = await fetch(
      `https://developers.hotmart.com/payments/api/v1/sales/history?product_id=${productId}&start_date=${since}&max_results=500`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    let students = 1200;
    if (salesRes.ok) {
      const sales = await salesRes.json();
      const emails = new Set();
      (sales.items || []).forEach((s) => {
        if (s.buyer && s.buyer.email && (s.purchase?.status === "APPROVED" || s.purchase?.status === "COMPLETE")) {
          emails.add(s.buyer.email.toLowerCase());
        }
      });
      students = Math.max(emails.size, 1200);
    }

    const data = {
      source: "hotmart_api",
      price_usd: product?.price?.value || 30,
      currency: product?.price?.currency_code || "USD",
      students,
      product_name: product?.name || "Loncheras Inteligentes",
      fetched_at: new Date().toISOString()
    };

    response = jsonResponse(data, 3600); // cache 1h
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    return jsonResponse({
      source: "fallback_after_error",
      price_usd: 30,
      students: 1200,
      currency: "USD",
      _error: err.message
    }, 60);
  }
}

function jsonResponse(data, cacheSeconds = 60) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
      "Access-Control-Allow-Origin": "*"
    }
  });
}
