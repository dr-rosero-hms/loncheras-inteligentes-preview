/**
 * Calculadora honesta — días para recuperar el costo del curso.
 * --------------------------------------------------------
 * Compatible con multi-currency (COP, MXN, ARS, CLP, PEN, EUR, USD).
 * Si la moneda detectada no es COP, el slider "gasto mensual" se
 * convierte automáticamente del baseline COP.
 */
(() => {
  "use strict";

  const form = document.getElementById("calc-ahorro");
  if (!form) return;

  const choices = form.querySelectorAll('input[name="habito"]');
  const gastoAnualEl = form.querySelector("#calc-gasto-anual");
  const daysRecoverEl = form.querySelector("#calc-days-recover");

  const CURSO_USD = 30;

  // Las opciones del radio están en COP/mes (baseline Colombia).
  // Para otras monedas, convertimos: COP → USD → moneda local.

  function getMensualCOP() {
    const checked = form.querySelector('input[name="habito"]:checked');
    return checked ? parseInt(checked.value, 10) : 380000;
  }

  function fmtCurrency(amount, currency) {
    const cfg = {
      COP: { locale: "es-CO", currency: "COP", maximumFractionDigits: 0 },
      MXN: { locale: "es-MX", currency: "MXN", maximumFractionDigits: 0 },
      ARS: { locale: "es-AR", currency: "ARS", maximumFractionDigits: 0 },
      CLP: { locale: "es-CL", currency: "CLP", maximumFractionDigits: 0 },
      PEN: { locale: "es-PE", currency: "PEN", maximumFractionDigits: 2 },
      EUR: { locale: "es-ES", currency: "EUR", maximumFractionDigits: 2 },
      USD: { locale: "en-US", currency: "USD", maximumFractionDigits: 0 },
    }[currency] || { locale: "en-US", currency: "USD", maximumFractionDigits: 0 };
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.currency,
      maximumFractionDigits: cfg.maximumFractionDigits,
    }).format(amount);
  }

  function pluralDias(n) { return n === 1 ? "1 día" : n + " días"; }

  function recompute() {
    const mensualCOP = getMensualCOP();
    const rates = window.__liRates || { COP: 3950, USD: 1 };
    const currency = window.__liCurrency || "USD";

    // 1. Convertir el gasto mensual de COP a USD baseline
    const trmCOP = rates.COP || 3950;
    const mensualUSD = mensualCOP / trmCOP;
    const gastoAnualUSD = mensualUSD * 12;

    // 2. Calcular días para recuperar (independiente de moneda)
    const gastoDiarioUSD = mensualUSD / 30;
    const diasRecuperar = Math.max(1, Math.round(CURSO_USD / gastoDiarioUSD));

    // 3. Render en moneda local
    const rate = rates[currency] || 1;
    gastoAnualEl.textContent = fmtCurrency(gastoAnualUSD * rate, currency);

    if (daysRecoverEl) {
      daysRecoverEl.textContent = pluralDias(diasRecuperar);
    }
  }

  choices.forEach((c) => c.addEventListener("change", recompute));
  window.addEventListener("li:currency-ready", recompute);
  window.addEventListener("li:currency-change", recompute);

  setTimeout(recompute, 100);
})();
