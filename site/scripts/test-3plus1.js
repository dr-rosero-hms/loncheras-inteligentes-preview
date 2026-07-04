/**
 * Test "3+1" — Isla interactiva
 * ----------------------------------------------------------
 * Diagnóstico con la voz del Dr. Rosero. Todas las frases entre
 * comillas son citas literales de sus transcripciones (V2_REGLA 3+1,
 * CONDUCTA ALIMENTARIA, BEBIDAS, LONCHERAS ANTI-ESTRÉS, Lo que debes
 * evitar, QUE NECESITA TU CUERPO).
 *
 * Validación inspirada en Zod (esquema declarativo + safeParse).
 */

(() => {
  "use strict";

  // ---------- Mini Zod-like validator ----------
  const z = {
    enum: (vals) => ({
      _vals: vals,
      safeParse(v) {
        return vals.includes(v)
          ? { success: true, data: v }
          : { success: false, error: `Selecciona una opción válida` };
      },
    }),
    object: (shape) => ({
      safeParse(obj) {
        const errors = {};
        const data = {};
        for (const k in shape) {
          const r = shape[k].safeParse(obj[k]);
          if (!r.success) errors[k] = r.error;
          else data[k] = r.data;
        }
        return Object.keys(errors).length
          ? { success: false, errors }
          : { success: true, data };
      },
    }),
  };

  const PROTEINA = ["pollo", "carne", "huevo", "queso", "atun", "jamon-cerdo", "ninguna"];
  const CARBO    = ["arepa", "yuca", "papa-natural", "tortilla-maiz", "galleta-arroz", "ninguno"];
  const VEGETAL  = ["lechuga", "tomate", "aguacate", "fresa", "mango", "banano", "kiwi", "ninguno"];
  const HIDRATA  = ["agua", "agua-limon", "te-sin-azucar", "jugo", "gaseosa", "ninguna"];

  const Schema = z.object({
    proteina: z.enum(PROTEINA),
    carbo:    z.enum(CARBO),
    vegetal:  z.enum(VEGETAL),
    hidrata:  z.enum(HIDRATA),
  });

  // ---------- Mensajes específicos por carencia (citas literales) ----------
  const FALTA = {
    proteina: {
      titulo: "Falta proteína",
      msg: "\"No se olviden de la proteína en todas las loncheras. Esto es fundamental, es necesario.\" Sin proteína no hay saciedad real — tu hijo va a recurrir a snacks procesados antes del recreo.",
    },
    carbo: {
      titulo: "Falta carbohidrato real",
      msg: "\"Los niños necesitan sí o sí aporte de carbohidratos porque van a tener explosiones de actividad física que necesitan ese suministro energético inmediato.\" Arepa, yuca o papa natural — no pan ni galleta procesada.",
    },
    vegetal: {
      titulo: "Falta vegetal o fruta",
      msg: "\"El óptimo aporte nutricional debe tener todos estos componentes. Ningún modelo restrictivo va a terminar siendo beneficioso a largo plazo.\" Una porción del tamaño de una unidad o una taza.",
    },
    hidrata: {
      titulo: "Hidratación incorrecta",
      msg: "\"Bebidas gaseosas, cero. Los jugos artificiales o de cajita tampoco — son una mezcla de azúcar, colorantes y un poquito de zumo de fruta.\" Agua, agua con limón o té sin azúcar.",
    },
  };

  const isProteinaOk = (v) => v && v !== "ninguna";
  const isCarboOk    = (v) => v && v !== "ninguno";
  const isVegetalOk  = (v) => v && v !== "ninguno";
  const isHidrataOk  = (v) => v === "agua" || v === "agua-limon" || v === "te-sin-azucar";

  function diagnosticar(data) {
    const checks = [
      { key: "proteina", ok: isProteinaOk(data.proteina) },
      { key: "carbo",    ok: isCarboOk(data.carbo) },
      { key: "vegetal",  ok: isVegetalOk(data.vegetal) },
      { key: "hidrata",  ok: isHidrataOk(data.hidrata) },
    ];
    const score = checks.filter((c) => c.ok).length;
    const fallos = checks.filter((c) => !c.ok).map((c) => FALTA[c.key]);

    let titulo, resumen;
    if (score === 4) {
      titulo = "La regla del 3+1 nunca falla";
      resumen = "Cumples las 4 piezas. \"Loncheras 100% nutritivas.\" No olvides que la fruta mejor a media mañana o media tarde, y las bebidas siempre sin azúcar.";
    } else if (score === 3) {
      titulo = "Casi. Te falta una pieza";
      resumen = "Recuerda la fórmula completa: \"1 proteína, 1 carbohidrato, 1 vegetal o fruta + 1 hidratación.\" Sin las 4, no es 100% nutritiva.";
    } else if (score === 2) {
      titulo = "Lonchera incompleta";
      resumen = "Faltan 2 piezas. \"Necesitamos los tres macronutrientes — ninguno es excluyente.\" Tu hijo va a llegar al recreo con hambre y a buscar algo procesado.";
    } else if (score === 1) {
      titulo = "Lonchera con riesgo metabólico";
      resumen = "Una pieza no alcanza. \"Cuando consumes ultraprocesados tu cuerpo produce un pico de insulina muy alto\" — y a la hora siguiente vienen la hipoglucemia y el antojo de azúcar.";
    } else {
      titulo = "Esto no es una lonchera";
      resumen = "\"Los ultraprocesados son los enemigos.\" Es exactamente la combinación que dispara insulina, baja la glucosa, eleva el cortisol y desregula el apetito. El curso te enseña a corregirlo.";
    }

    return { score, titulo, resumen, fallos };
  }

  // ---------- DOM ----------
  const form    = document.getElementById("test-3plus1");
  if (!form) return;
  const result  = document.getElementById("test-result");
  const errBox  = document.getElementById("test-errors");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errBox.textContent = "";
    const fd = new FormData(form);
    const raw = {
      proteina: fd.get("proteina"),
      carbo:    fd.get("carbo"),
      vegetal:  fd.get("vegetal"),
      hidrata:  fd.get("hidrata"),
    };
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      errBox.textContent = "Por favor responde las 4 preguntas para recibir el diagnóstico.";
      return;
    }

    const dx = diagnosticar(parsed.data);

    result.innerHTML = `
      <h3>${escapeHtml(dx.titulo)}</h3>
      <div class="test__score">${dx.score} / 4 ✓</div>
      <p>${escapeHtml(dx.resumen)}</p>
      ${
        dx.fallos.length
          ? `<ul class="test__feedback">${dx.fallos
              .map((f) => `<li><strong>${escapeHtml(f.titulo)}.</strong> ${escapeHtml(f.msg)}</li>`)
              .join("")}</ul>`
          : ""
      }
      <a class="btn btn--lg" href="#empezar" style="margin-top:1rem">Quiero el método completo →</a>
    `;
    result.classList.add("is-visible");
    result.scrollIntoView({ behavior: "smooth", block: "center" });

    try { console.info("[test-3plus1] score:", dx.score); } catch (_) {}
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }
})();
