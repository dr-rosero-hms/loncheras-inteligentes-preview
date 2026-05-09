/**
 * Currency Switcher LATAM — 6 monedas con tasas vivas
 * --------------------------------------------------------
 * Soporta: COP, MXN, ARS, CLP, PEN, EUR, USD
 *
 * Detección por IP (ipapi.co → fallback ipwho.is) →
 * mapeo país → moneda local → render con Intl.NumberFormat.
 *
 * Para Colombia usa la TRM oficial del Banco de la República
 * (datos.gov.co). Para el resto usa open.er-api.com (gratis,
 * sin API key, todas las divisas vs USD en una sola llamada).
 *
 * Cache: 7 días para país detectado, 24h para tasas.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "li.currency.v2";
  const GEO_KEY     = "li.geo.v2";
  const RATES_KEY   = "li.rates.v2";
  const GEO_TTL_MS  = 7 * 24 * 60 * 60 * 1000;
  const RATES_TTL_MS = 24 * 60 * 60 * 1000;

  // ---------- Mapping país → moneda local ----------
  // Solo monedas con tasas estables y mercado relevante de Hotmart.
  // Países dolarizados (EC, SV, PA, BO casos especiales) → USD.
  const COUNTRY_TO_CURRENCY = {
    CO: "COP", // Colombia
    MX: "MXN", // México
    AR: "ARS", // Argentina
    CL: "CLP", // Chile
    PE: "PEN", // Perú
    ES: "EUR", // España
    EC: "USD", // Ecuador (dolarizado)
    SV: "USD", // El Salvador (dolarizado)
    PA: "USD", // Panamá (dolarizado)
    // Resto del mundo → USD
  };

  // ---------- Formato por moneda (Intl.NumberFormat) ----------
  const FORMATS = {
    COP: { locale: "es-CO", currency: "COP", maximumFractionDigits: 0 },
    MXN: { locale: "es-MX", currency: "MXN", maximumFractionDigits: 0 },
    ARS: { locale: "es-AR", currency: "ARS", maximumFractionDigits: 0 },
    CLP: { locale: "es-CL", currency: "CLP", maximumFractionDigits: 0 },
    PEN: { locale: "es-PE", currency: "PEN", maximumFractionDigits: 2 },
    EUR: { locale: "es-ES", currency: "EUR", maximumFractionDigits: 2 },
    USD: { locale: "en-US", currency: "USD", maximumFractionDigits: 0 },
  };

  // Tasas de fallback (mayo 2026) — solo si TODOS los APIs fallan.
  const FALLBACK_RATES = {
    USD: 1, COP: 3950, MXN: 17.5, ARS: 920, CLP: 880, PEN: 3.7, EUR: 0.92,
  };

  const SUPPORTED = Object.keys(FORMATS);

  // ---------- Detectar país por IP ----------
  async function detectByIP() {
    try {
      const cached = JSON.parse(localStorage.getItem(GEO_KEY) || "null");
      if (cached && Date.now() - cached.fetchedAt < GEO_TTL_MS && cached.country) {
        return cached.country;
      }
    } catch (_) {}

    // ipapi.co (1000 req/día, sin key)
    try {
      const r = await fetch("https://ipapi.co/json/", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j && j.country_code) { cacheGeo(j.country_code); return j.country_code; }
      }
    } catch (_) {}

    // ipwho.is (sin key, sin límite documentado)
    try {
      const r = await fetch("https://ipwho.is/", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j && j.success && j.country_code) {
          cacheGeo(j.country_code); return j.country_code;
        }
      }
    } catch (_) {}

    return null;
  }

  function cacheGeo(country) {
    try {
      localStorage.setItem(GEO_KEY, JSON.stringify({ country, fetchedAt: Date.now() }));
    } catch (_) {}
  }

  // ---------- Heurística rápida (síncrona) ----------
  function detectByLocale() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const lang = (navigator.language || "").toLowerCase();
      // Bogotá, Lima, México, Buenos Aires, Santiago
      const tzMap = {
        "America/Bogota": "COP",
        "America/Mexico_City": "MXN",
        "America/Argentina/Buenos_Aires": "ARS",
        "America/Santiago": "CLP",
        "America/Lima": "PEN",
        "Europe/Madrid": "EUR",
      };
      if (tzMap[tz]) return tzMap[tz];
      // language hints
      if (lang.startsWith("es-co")) return "COP";
      if (lang.startsWith("es-mx")) return "MXN";
      if (lang.startsWith("es-ar")) return "ARS";
      if (lang.startsWith("es-cl")) return "CLP";
      if (lang.startsWith("es-pe")) return "PEN";
      if (lang.startsWith("es-es")) return "EUR";
    } catch (_) {}
    return null;
  }

  // ---------- Detección final (async, con fallbacks) ----------
  async function detectInitialCurrency() {
    // 1. Override manual (gana siempre)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;

    // 2. IP geolocation (más preciso)
    const country = await detectByIP();
    if (country) {
      const currency = COUNTRY_TO_CURRENCY[country.toUpperCase()] || "USD";
      if (SUPPORTED.includes(currency)) return currency;
    }

    // 3. Locale heurístico (rápido, sin red)
    const local = detectByLocale();
    if (local && SUPPORTED.includes(local)) return local;

    return "USD";
  }

  // ---------- Tasas vivas ----------
  async function getRates() {
    try {
      const cached = JSON.parse(localStorage.getItem(RATES_KEY) || "null");
      if (cached && Date.now() - cached.fetchedAt < RATES_TTL_MS && cached.rates) {
        return cached.rates;
      }
    } catch (_) {}

    const rates = { ...FALLBACK_RATES };

    // open.er-api.com (todas las divisas vs USD en una sola llamada)
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      if (r.ok) {
        const j = await r.json();
        if (j && j.rates) {
          for (const c of SUPPORTED) {
            if (j.rates[c] && j.rates[c] > 0) rates[c] = j.rates[c];
          }
        }
      }
    } catch (_) {}

    // Override COP con TRM oficial del Banco de la República (más preciso para Colombia)
    try {
      const r = await fetch("https://www.datos.gov.co/resource/ceyp-9c7c.json?$order=vigenciadesde DESC&$limit=1");
      if (r.ok) {
        const j = await r.json();
        const trm = parseFloat(j[0]?.valor);
        if (trm > 1000 && trm < 10000) rates.COP = trm;
      }
    } catch (_) {}

    cacheRates(rates);
    return rates;
  }

  function cacheRates(rates) {
    try {
      localStorage.setItem(RATES_KEY, JSON.stringify({ rates, fetchedAt: Date.now() }));
    } catch (_) {}
  }

  // ---------- Render ----------
  function formatAmount(usdAmount, currency, rate) {
    const local = usdAmount * rate;
    const cfg = FORMATS[currency] || FORMATS.USD;
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.currency,
      maximumFractionDigits: cfg.maximumFractionDigits,
    }).format(local);
  }

  function applyCurrency(currency, rates) {
    const rate = rates[currency] || 1;
    document.querySelectorAll("[data-price-usd]").forEach((el) => {
      const usd = parseFloat(el.getAttribute("data-price-usd"));
      if (!usd || isNaN(usd)) return;
      const target = el.querySelector(".price-amount") || el;
      target.textContent = formatAmount(usd, currency, rate);
    });
  }

  // ---------- Init ----------
  async function init() {
    // Render rápido con heurística síncrona (evita flash de moneda equivocada)
    const localeQuick = detectByLocale() || "USD";
    const rates = await getRates();
    applyCurrency(localeQuick, rates);

    // Refinamiento async con IP (más preciso)
    const finalCurrency = await detectInitialCurrency();
    applyCurrency(finalCurrency, rates);

    // Exponer para uso de la calculadora
    window.__liRate = rates[finalCurrency] || 1;
    window.__liRates = rates;
    window.__liCurrency = finalCurrency;
    window.__liTRM = rates.COP || 3950; // backwards compat con calculadora.js
    window.dispatchEvent(new CustomEvent("li:currency-ready", { detail: { currency: finalCurrency, rates } }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
