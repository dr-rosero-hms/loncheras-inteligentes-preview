/**
 * Cloudflare Pages Function: /api/test-submit
 * --------------------------------------------------------
 * Procesa el envío del Test 3+1 extendido. Maneja:
 *   1. Validación server-side (anti-spam)
 *   2. Cálculo del diagnóstico (replica la lógica del cliente)
 *   3. Envío del lead a Brevo (lista + email transaccional)
 *   4. Forwarding a Make.com webhook (orquestación con otras herramientas)
 *
 * Secrets de Cloudflare requeridos para activación completa:
 *   - BREVO_API_KEY        (xkeysib-...)
 *   - BREVO_LIST_ID        (id de lista en Brevo, ej. "5")
 *   - BREVO_SENDER_EMAIL   (oscar@academiacomidareal.com)
 *   - BREVO_SENDER_NAME    (Dr. Oscar Rosero)
 *   - MAKE_WEBHOOK_URL     (https://hook.eu1.make.com/abc...)
 *
 * Configurar via wrangler:
 *   npx wrangler pages secret put BREVO_API_KEY --project-name=loncheras-inteligentes
 *
 * Si los secrets no están configurados, el endpoint igual funciona:
 * devuelve el diagnóstico al cliente pero sin enviar email/Make.
 * Esto evita perder datos en caso de fallo de integración.
 */

const ENUMS = {
  proteina: ["huevo","pollo","carne","queso","atun","jamon","ninguna"],
  carbo: ["arepa","yuca","tortilla","galleta-arroz","pan-procesado","ninguno"],
  vegetal: ["tomate","aguacate","lechuga","fruta","jugo","ninguno"],
  hidrata: ["agua","agua-limon","jugo-caja","gaseosa","ninguna"],
  frecuencia: ["nunca","1-2","3-4","diario"],
  edad: ["0-5","5-10","10-15","adulto"],
};

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: "bad request" }, 400); }

  // 1. Validar
  const data = {};
  for (const k of Object.keys(ENUMS)) {
    if (!ENUMS[k].includes(body[k])) {
      return jsonResp({ error: `Invalid ${k}` }, 400);
    }
    data[k] = body[k];
  }
  data.name = (body.name || "").toString().slice(0, 80).trim();
  data.email = (body.email || "").toString().slice(0, 200).trim().toLowerCase();
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return jsonResp({ error: "Invalid email" }, 400);
  }

  // 2. Calcular diagnóstico
  const dx = diagnose(data);

  // 3. Brevo (si hay credenciales)
  let emailSent = false;
  if (data.email && env.BREVO_API_KEY) {
    try {
      // Add/update contact en lista
      await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "accept": "application/json" },
        body: JSON.stringify({
          email: data.email,
          attributes: {
            FIRSTNAME: data.name || "",
            TEST_SCORE: dx.score,
            TEST_URGENCIA: dx.urgencia,
            EDAD: data.edad,
            FRECUENCIA_PROCESADOS: data.frecuencia,
          },
          listIds: env.BREVO_LIST_ID ? [parseInt(env.BREVO_LIST_ID, 10)] : [],
          updateEnabled: true,
        }),
      });

      // Enviar email transaccional con diagnóstico
      const senderEmail = env.BREVO_SENDER_EMAIL || "oscar@academiacomidareal.com";
      const senderName = env.BREVO_SENDER_NAME || "Dr. Oscar Rosero";
      const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "accept": "application/json" },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email: data.email, name: data.name || data.email }],
          subject: `Tu diagnóstico Regla 3+1: ${dx.score}/4 — ${dx.titulo}`,
          htmlContent: buildEmailHTML(data, dx),
        }),
      });
      emailSent = emailRes.ok;
    } catch (err) {
      console.error("[brevo]", err);
    }
  }

  // 4. Make.com webhook (orquestación)
  if (env.MAKE_WEBHOOK_URL) {
    try {
      await fetch(env.MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "test_3plus1_completed",
          submitted_at: new Date().toISOString(),
          score: dx.score,
          urgencia: dx.urgencia,
          contact: { name: data.name, email: data.email },
          answers: {
            proteina: data.proteina, carbo: data.carbo, vegetal: data.vegetal,
            hidrata: data.hidrata, frecuencia: data.frecuencia, edad: data.edad
          },
          diagnosis: { titulo: dx.titulo, resumen: dx.resumen, fallos: dx.fallos.map(f => f.titulo), notas: dx.extras.map(f => f.titulo) },
        }),
      });
    } catch (err) {
      console.error("[make]", err);
    }
  }

  return jsonResp({
    success: true,
    score: dx.score,
    titulo: dx.titulo,
    email_sent: emailSent,
  });
}

// ---------- Lógica de diagnóstico (mismo que cliente) ----------
function diagnose(data) {
  const isProteinaOk = (v) => v && v !== "ninguna";
  const isCarboOk    = (v) => v && !["pan-procesado","ninguno"].includes(v);
  const isVegetalOk  = (v) => v && !["jugo","ninguno"].includes(v);
  const isHidrataOk  = (v) => ["agua","agua-limon"].includes(v);

  const checks = {
    proteina: isProteinaOk(data.proteina),
    carbo:    isCarboOk(data.carbo),
    vegetal:  isVegetalOk(data.vegetal),
    hidrata:  isHidrataOk(data.hidrata),
  };
  const score = Object.values(checks).filter(Boolean).length;

  const FALTA = {
    proteina: { titulo: "Falta proteína", msg: "Sin proteína no hay saciedad real." },
    carbo:    { titulo: "Falta carbohidrato real", msg: "Arepa, yuca o papa — no pan ni galleta procesada." },
    vegetal:  { titulo: "Falta vegetal o fruta", msg: "Una porción del tamaño de una unidad o una taza." },
    hidrata:  { titulo: "Hidratación incorrecta", msg: "Agua, agua con limón o té sin azúcar — cero jugos ni gaseosas." },
  };
  const fallos = Object.keys(checks).filter(k => !checks[k]).map(k => FALTA[k]);

  let titulo, resumen, urgencia = "normal";
  if (score === 4) { titulo = "La regla del 3+1 nunca falla"; resumen = "Cumples las 4 piezas. Loncheras 100% nutritivas."; }
  else if (score === 3) { titulo = "Casi. Te falta una pieza"; resumen = "1 proteína + 1 carbohidrato + 1 vegetal/fruta + 1 hidratación."; }
  else if (score === 2) { titulo = "Lonchera incompleta"; resumen = "Faltan 2 piezas. Tu hijo va a llegar al recreo con hambre."; }
  else if (score === 1) { titulo = "Lonchera con riesgo metabólico"; resumen = "Pico de insulina, hipoglucemia 1 hora después, antojo de azúcar."; urgencia = "alta"; }
  else { titulo = "Esto no es una lonchera"; resumen = "Los ultraprocesados son los enemigos."; urgencia = "alta"; }

  // Notas personalizadas por edad y frecuencia (paridad con el cliente, citas literales del Dr.)
  const extras = [];
  if (data.frecuencia === "diario" || data.frecuencia === "3-4") {
    extras.push({ titulo: "Frecuencia preocupante", msg: "El Dr. Rosero: \"Si los refrigerios salen de tu casa, van a ser 100 veces mejores que lo que vas a comprar.\" El curso te enseña a planearlos en un solo momento de la semana." });
  }
  if (data.edad === "0-5") {
    extras.push({ titulo: "Edad clave", msg: "\"La epigenética y la alimentación los primeros años de vida son cruciales en el neuroendocrinoinmuno desarrollo de los hijos.\" El Bono 2 (5 tips de crecimiento) está hecho para esta edad." });
  }
  if (data.edad === "adulto") {
    extras.push({ titulo: "Para adultos también", msg: "El Dr.: \"Vamos a aprender la regla del 3+1 para sus hijos, pero también para ustedes en la oficina.\"" });
  }

  return { score, titulo, resumen, fallos, extras, urgencia };
}

// ---------- HTML del email ----------
function buildEmailHTML(data, dx) {
  const fallos = dx.fallos.map(f => `<li><strong>${esc(f.titulo)}.</strong> ${esc(f.msg)}</li>`).join("");
  const extras = (dx.extras || []).map(f => `<li><strong>${esc(f.titulo)}.</strong> ${esc(f.msg)}</li>`).join("");
  const greeting = data.name ? `Hola ${esc(data.name)},` : "Hola,";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Diagnóstico Regla 3+1</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#0f172a;line-height:1.55">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#fff">
    <div style="text-align:center;padding-bottom:24px;border-bottom:2px solid #56b221">
      <h1 style="margin:0;font-size:22px;color:#0f172a">Tu diagnóstico Regla 3+1</h1>
      <p style="margin:6px 0 0;color:#475569;font-size:14px">Dr. Oscar Rosero · Médico Endocrinólogo</p>
    </div>

    <p style="margin-top:24px">${greeting}</p>
    <p>Tu lonchera obtuvo <strong style="color:#56b221;font-size:18px">${dx.score} / 4</strong> piezas de la Regla 3+1.</p>

    <div style="background:#eafaee;border-left:4px solid #56b221;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
      <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a">${esc(dx.titulo)}</h2>
      <p style="margin:0;color:#0f172a">${esc(dx.resumen)}</p>
    </div>

    ${fallos ? `<h3 style="margin:24px 0 12px;font-size:16px">Lo que necesitas corregir:</h3><ul style="padding-left:20px">${fallos}</ul>` : `<p style="margin:24px 0;font-size:16px"><strong>¡Excelente!</strong> Sigue así. La fórmula 3+1 nunca falla.</p>`}

    ${extras ? `<h3 style="margin:24px 0 12px;font-size:16px">Notas personalizadas:</h3><ul style="padding-left:20px">${extras}</ul>` : ""}

    <h3 style="margin:32px 0 12px;font-size:16px">¿Qué sigue?</h3>
    <p>El curso completo "Loncheras Inteligentes" tiene 14 módulos en video, 11 recetas paso a paso, y los 2 bonos exclusivos (lectura de etiquetas + crecimiento infantil).</p>

    <p style="text-align:center;margin:32px 0">
      <a href="https://pay.hotmart.com/K100999555X" style="display:inline-block;background:#56b221;color:#fff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;font-size:14px">Inscribirme — $30 USD</a>
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
</body></html>`;
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
