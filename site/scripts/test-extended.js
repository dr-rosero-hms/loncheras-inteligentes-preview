/**
 * Test 3+1 EXTENDED — página standalone /test-3-1/
 * --------------------------------------------------------
 * 6 preguntas + email opcional → POST /api/test-submit →
 * Brevo lead capture + email transaccional + Make webhook.
 *
 * Si el usuario no da email, el diagnóstico igual se muestra
 * en pantalla (no perdemos al usuario que no quiere dejar email).
 */
(() => {
  "use strict";

  const form = document.getElementById("test-extended");
  if (!form) return;
  const result = document.getElementById("test-result");
  const errBox = document.getElementById("test-errors");
  const submitBtn = form.querySelector('button[type="submit"]');

  // ---------- Validador tipo Zod ----------
  const z = {
    enum: (vals) => ({ safeParse: (v) => vals.includes(v) ? { success: true, data: v } : { success: false, error: "Selecciona una opción" } }),
    optional: (val) => ({ safeParse: (v) => ({ success: true, data: v || null }) }),
    email: () => ({ safeParse: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { success: true, data: v || null } : { success: false, error: "Email inválido" } }),
    string: () => ({ safeParse: (v) => ({ success: true, data: (v || "").trim() }) }),
  };

  const Schema = {
    proteina: z.enum(["huevo","pollo","carne","queso","atun","jamon","ninguna"]),
    carbo: z.enum(["arepa","yuca","tortilla","galleta-arroz","pan-procesado","ninguno"]),
    vegetal: z.enum(["tomate","aguacate","lechuga","fruta","jugo","ninguno"]),
    hidrata: z.enum(["agua","agua-limon","jugo-caja","gaseosa","ninguna"]),
    frecuencia: z.enum(["nunca","1-2","3-4","diario"]),
    edad: z.enum(["0-5","5-10","10-15","adulto"]),
    name: z.string(),
    email: z.email(),
  };

  // ---------- Diagnóstico (cliente, mostramos rápido + servidor lo replica para email) ----------
  const isProteinaOk = (v) => v && v !== "ninguna";
  const isCarboOk    = (v) => v && !["pan-procesado","ninguno"].includes(v);
  const isVegetalOk  = (v) => v && !["jugo","ninguno"].includes(v);
  const isHidrataOk  = (v) => ["agua","agua-limon"].includes(v);

  const FALTA = {
    proteina: { titulo: "Falta proteína", msg: "\"No se olviden de la proteína. Esto es fundamental, es necesario.\" Sin proteína no hay saciedad real." },
    carbo:    { titulo: "Falta carbohidrato real", msg: "\"Los niños necesitan sí o sí aporte de carbohidratos para esas explosiones de actividad física.\" Arepa, yuca, papa — no pan procesado." },
    vegetal:  { titulo: "Falta vegetal o fruta", msg: "\"El óptimo aporte nutricional debe tener todos estos componentes. Ningún modelo restrictivo es beneficioso.\" Una porción del tamaño de una unidad o una taza." },
    hidrata:  { titulo: "Hidratación incorrecta", msg: "\"Bebidas gaseosas, cero. Los jugos artificiales tampoco — son una mezcla de azúcar y colorantes.\" Agua, agua con limón o té sin azúcar." },
  };

  function diagnose(data) {
    const checks = {
      proteina: isProteinaOk(data.proteina),
      carbo:    isCarboOk(data.carbo),
      vegetal:  isVegetalOk(data.vegetal),
      hidrata:  isHidrataOk(data.hidrata),
    };
    const score = Object.values(checks).filter(Boolean).length;
    const fallos = Object.keys(checks).filter(k => !checks[k]).map(k => FALTA[k]);

    let titulo, resumen, urgencia = "normal";
    if (score === 4) {
      titulo = "La regla del 3+1 nunca falla";
      resumen = "Cumples las 4 piezas. \"Loncheras 100% nutritivas.\" Tu hijo va a tener saciedad real, energía estable y cero antojos en la próxima clase.";
    } else if (score === 3) {
      titulo = "Casi. Te falta una pieza";
      resumen = "Recuerda la fórmula completa: 1 proteína + 1 carbohidrato + 1 vegetal o fruta + 1 hidratación. Sin las 4, no es 100% nutritiva.";
    } else if (score === 2) {
      titulo = "Lonchera incompleta";
      resumen = "Faltan 2 piezas. \"Necesitamos los tres macronutrientes — ninguno es excluyente.\" Tu hijo va a llegar al recreo con hambre.";
    } else if (score === 1) {
      titulo = "Lonchera con riesgo metabólico";
      resumen = "Una pieza no alcanza. Cuando consumes ultraprocesados, tu cuerpo produce un pico de insulina, hipoglucemia 1 hora después, y antojo de azúcar.";
      urgencia = "alta";
    } else {
      titulo = "Esto no es una lonchera";
      resumen = "\"Los ultraprocesados son los enemigos.\" Es la combinación que dispara insulina, baja la glucosa, eleva el cortisol y desregula el apetito.";
      urgencia = "alta";
    }

    // Bonus: por edad y frecuencia
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

  // ---------- Submit ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.textContent = "";
    const fd = new FormData(form);
    const raw = {
      proteina: fd.get("proteina"),
      carbo: fd.get("carbo"),
      vegetal: fd.get("vegetal"),
      hidrata: fd.get("hidrata"),
      frecuencia: fd.get("frecuencia"),
      edad: fd.get("edad"),
      name: fd.get("name"),
      email: fd.get("email"),
    };

    // Validar
    const data = {};
    let firstError = null;
    for (const k in Schema) {
      const r = Schema[k].safeParse(raw[k]);
      if (!r.success) { firstError = firstError || `${k}: ${r.error}`; continue; }
      data[k] = r.data;
    }
    const requiredKeys = ["proteina","carbo","vegetal","hidrata","frecuencia","edad"];
    const missing = requiredKeys.filter(k => !data[k]);
    if (missing.length) {
      errBox.textContent = "Por favor responde las 6 preguntas (te falta " + missing[0] + ").";
      const stepEl = form.querySelector(`[data-step="${requiredKeys.indexOf(missing[0]) + 1}"]`);
      if (stepEl) stepEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Render rápido en cliente (UX inmediato)
    const dx = diagnose(data);
    renderResult(dx, data);
    submitBtn.disabled = true;
    submitBtn.textContent = "Procesando…";
    result.scrollIntoView({ behavior: "smooth", block: "center" });

    // Enviar al backend (Brevo + Make + analytics)
    try {
      // Endpoint ABSOLUTO: el Worker vive en academiacomidareal.com;
      // en staging (otro host/carpeta) una ruta relativa daría 404.
      const res = await fetch("https://academiacomidareal.com/api/test-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      // El servidor puede devolver sugerencias adicionales (ej: si email ya estaba registrado)
      if (json.email_sent) {
        const note = document.createElement("p");
        note.className = "test__email-confirm";
        note.innerHTML = "📧 Te mandé el diagnóstico completo a <strong>" + (data.email || "tu email") + "</strong>. Revisa la bandeja en los próximos minutos.";
        result.appendChild(note);
      }
    } catch (err) {
      console.warn("[test-submit]", err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Ver mi diagnóstico";
    }

    if (window.liTrack) window.liTrack("Lead", { source: "test-extended", score: dx.score });
  });

  function renderResult(dx, data) {
    const fallos = (dx.fallos || []).map(f => `<li><strong>${esc(f.titulo)}.</strong> ${esc(f.msg)}</li>`).join("");
    const extras = (dx.extras || []).map(f => `<li><strong>${esc(f.titulo)}.</strong> ${esc(f.msg)}</li>`).join("");
    result.innerHTML = `
      <h3>${esc(dx.titulo)}</h3>
      <div class="test__score">${dx.score} / 4 ✓</div>
      <p>${esc(dx.resumen)}</p>
      ${fallos ? `<ul class="test__feedback">${fallos}</ul>` : ""}
      ${extras ? `<div class="test__extras"><strong style="color:var(--brand-dark)">Notas personalizadas:</strong><ul class="test__feedback">${extras}</ul></div>` : ""}
      <a class="btn btn--lg" href="../#oferta" target="_blank" rel="noopener noreferrer" style="margin-top:1rem;width:100%;justify-content:center">Quiero el método completo →</a>
    `;
    result.classList.add("is-visible");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  }
})();
