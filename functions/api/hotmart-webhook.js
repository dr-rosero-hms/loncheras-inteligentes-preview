/**
 * Cloudflare Pages Function: /api/hotmart-webhook
 * --------------------------------------------------------
 * Recibe webhooks de Hotmart cuando ocurre una compra/cancelación
 * y notifica al Dr. Rosero por Slack/Discord/Email.
 *
 * Para activar:
 *   1. En Hotmart: Configuración → Webhooks → Add webhook
 *      URL: https://loncheras-inteligentes.pages.dev/api/hotmart-webhook
 *      Eventos: PURCHASE_COMPLETE, PURCHASE_APPROVED, PURCHASE_REFUNDED
 *   2. En Cloudflare Pages secrets:
 *      - HOTMART_WEBHOOK_TOKEN  (token que Hotmart envía para validar)
 *      - SLACK_WEBHOOK_URL      (opcional — pega aquí tu Slack webhook)
 *      - DISCORD_WEBHOOK_URL    (opcional — Discord webhook)
 *      - NOTIFICATION_EMAIL     (opcional — destinatario de email vía Resend/Brevo)
 */

export async function onRequestPost({ env, request }) {
  // 1. Validar token de Hotmart (anti-falsificación)
  const expectedToken = env.HOTMART_WEBHOOK_TOKEN;
  if (expectedToken) {
    const headerToken = request.headers.get("x-hotmart-hottok") ||
                        request.headers.get("X-HOTMART-HOTTOK");
    if (headerToken !== expectedToken) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload;
  try { payload = await request.json(); }
  catch { return new Response("Bad Request", { status: 400 }); }

  // 2. Solo notificar compras aprobadas/completas
  const event = payload.event || payload.id;
  const status = payload.data?.purchase?.status || payload.status;
  const isPurchase =
    /PURCHASE.*APPROVED|PURCHASE.*COMPLETE/i.test(event) ||
    /APPROVED|COMPLETE/i.test(status || "");
  if (!isPurchase) {
    return new Response("ignored", { status: 200 });
  }

  // 3. Construir mensaje
  const buyer = payload.data?.buyer || {};
  const purchase = payload.data?.purchase || {};
  const product = payload.data?.product || {};
  const amount = purchase.price?.value || purchase.full_price?.value || 0;
  const currency = purchase.price?.currency_value || "USD";
  const message = {
    title: "🎉 Nueva venta — Loncheras Inteligentes",
    text:
      `*${buyer.name || "Comprador"}* (${buyer.country || "?"}) compró ` +
      `${product.name || "el curso"} — ${currency} ${amount}\n` +
      `📧 ${buyer.email || "—"}\n📱 ${buyer.checkout_phone || "—"}`,
    timestamp: new Date().toISOString()
  };

  // 4. Notificar en paralelo a Slack / Discord / Email
  const tasks = [];

  if (env.SLACK_WEBHOOK_URL) {
    tasks.push(fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*${message.title}*\n${message.text}` })
    }));
  }

  if (env.DISCORD_WEBHOOK_URL) {
    tasks.push(fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: message.title,
          description: message.text,
          color: 0x56b221,
          timestamp: message.timestamp
        }]
      })
    }));
  }

  if (env.RESEND_API_KEY && env.NOTIFICATION_EMAIL) {
    tasks.push(fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "ventas@academiacomidareal.com",
        to: env.NOTIFICATION_EMAIL,
        subject: message.title,
        text: message.text
      })
    }));
  }

  await Promise.allSettled(tasks);

  return new Response(JSON.stringify({ ok: true, notified: tasks.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
