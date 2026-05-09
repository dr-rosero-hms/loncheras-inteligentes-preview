/**
 * Calculadora de "perspectiva": cuánto gastas vs cuánto cuesta el curso.
 * --------------------------------------------------------
 * Modelo honesto:
 *   - Card 1: gasto anual en procesados (mensual × 12)
 *   - Card 2: costo del curso ($30 USD convertido a moneda local)
 *   - Card 3: cuántos días de tu gasto actual paga el curso
 *
 * Por qué cambió: la fórmula anterior (gasto_anual − curso = ahorro)
 * era engañosa porque asumía que comprar el curso elimina el 100%
 * del gasto en procesados. Eso no es cierto. La nueva métrica
 * (días para recuperar) es matemática pura: no promete ahorro,
 * solo pone el costo del curso en perspectiva.
 */
(() => {
  "use strict";

  const form = document.getElementById("calc-ahorro");
  if (!form) return;

  const choices = form.querySelectorAll('input[name="habito"]');
  const gastoAnualEl = form.querySelector("#calc-gasto-anual");
  const daysRecoverEl = form.querySelector("#calc-days-recover");

  const fmtCOP = (n) =>
    new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n));

  const CURSO_USD = 30;

  function getMensual() {
    const checked = form.querySelector('input[name="habito"]:checked');
    return checked ? parseInt(checked.value, 10) : 380000;
  }

  function pluralDias(n) {
    return n === 1 ? "1 día" : n + " días";
  }

  function recompute() {
    const mensual = getMensual();
    const trm = window.__liTRM || 3950;
    const currency = window.__liCurrency || "USD";

    const gastoAnual = mensual * 12;
    const cursoCOP = CURSO_USD * trm;
    const gastoDiario = mensual / 30;
    const diasRecuperar = Math.max(1, Math.round(cursoCOP / gastoDiario));

    if (currency === "COP") {
      gastoAnualEl.textContent = "COP " + fmtCOP(gastoAnual);
    } else {
      const gastoUSD = gastoAnual / trm;
      gastoAnualEl.textContent = "$" + Math.round(gastoUSD) + " USD";
    }

    if (daysRecoverEl) {
      daysRecoverEl.textContent = pluralDias(diasRecuperar);
    }
  }

  choices.forEach((c) => c.addEventListener("change", recompute));
  window.addEventListener("li:currency-change", recompute);
  window.addEventListener("li:currency-ready", recompute);

  setTimeout(recompute, 100);
})();
