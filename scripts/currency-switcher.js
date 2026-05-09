/**
 * Currency Switcher COP/USD con TRM en vivo
 * --------------------------------------------------------
 * Fuente principal: Banco de la República (datos.gov.co API pública)
 * Fallback: open.er-api.com (sin auth, gratis)
 * Cache: 24h en localStorage
 *
 * Detección automática de país:
 *  - Si timezone es America/Bogota → muestra COP por defecto
 *  - En otros casos → USD
 *  - El usuario siempre puede cambiar manualmente (preferencia persistida).
 *
 * Cómo funciona:
 *  - Cualquier elemento con [data-price-usd="N"] se actualiza automáticamente
 *  - El value puede ser "$30 USD" o "$2 USD" — se reemplaza con el equivalente
 */
(() => {
  "use strict";

  const STORAGE_KEY = "li.currency.v1";        // preferencia del usuario (override manual)
  const GEO_KEY     = "li.geo.v1";             // país detectado vía IP (cache 7 días)
  const TRM_KEY     = "li.trm.v1";             // TRM cache (24h)
  const GEO_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 días
  const TRM_TTL_MS  = 24 * 60 * 60 * 1000;     // 24h

  // 1a. Heurística rápida (síncrona) — timezone + language
  function detectByLocale() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const lang = (navigator.language || "").toLowerCase();
      if (tz === "America/Bogota" || lang.startsWith("es-co")) return "COP";
    } catch (_) {}
    return null;
  }

  // 1b. Detección precisa por IP (asíncrona) — ipapi.co (1000 req/día gratis, sin key)
  // Fallback: ipwho.is (sin key, sin límite documentado)
  async function detectByIP() {
    try {
      const cached = JSON.parse(localStorage.getItem(GEO_KEY) || "null");
      if (cached && Date.now() - cached.fetchedAt < GEO_TTL_MS && cached.country) {
        return cached.country;
      }
    } catch (_) {}

    // Intento 1: ipapi.co
    try {
      const r = await fetch("https://ipapi.co/json/", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j && j.country_code) {
          cacheGeo(j.country_code);
          return j.country_code;
        }
      }
    } catch (_) {}

    // Intento 2: ipwho.is (fallback)
    try {
      const r2 = await fetch("https://ipwho.is/", { cache: "no-store" });
      if (r2.ok) {
        const j = await r2.json();
        if (j && j.success && j.country_code) {
          cacheGeo(j.country_code);
          return j.country_code;
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

  // 1c. Mapping país → moneda preferida
  // Colombia → COP. Resto de LATAM con sus propias monedas → USD por defecto (Hotmart cobra USD).
  function countryToCurrency(country) {
    if (!country) return null;
    const c = country.toUpperCase();
    if (c === "CO") return "COP";
    return "USD";
  }

  // 1d. Decisión final de moneda inicial (preferencia > IP > locale > USD)
  async function detectInitialCurrency() {
    // 1. Preferencia explícita del usuario (gana siempre)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "USD" || stored === "COP") return stored;

    // 2. IP geolocation (más preciso)
    const ipCountry = await detectByIP();
    const ipCurrency = countryToCurrency(ipCountry);
    if (ipCurrency) return ipCurrency;

    // 3. Locale del navegador (rápido pero menos preciso)
    const localeCurr = detectByLocale();
    if (localeCurr) return localeCurr;

    // 4. Default
    return "USD";
  }

  // 2. Obtener TRM (con cache)
  async function getTRM() {
    try {
      const cached = JSON.parse(localStorage.getItem(TRM_KEY) || "null");
      if (cached && Date.now() - cached.fetchedAt < TRM_TTL_MS && cached.rate > 0) {
        return cached.rate;
      }
    } catch (_) {}

    // Banco de la República (oficial Colombia)
    try {
      const r = await fetch("https://www.datos.gov.co/resource/ceyp-9c7c.json?$order=vigenciadesde DESC&$limit=1", {
        headers: { Accept: "application/json" },
      });
      if (r.ok) {
        const json = await r.json();
        const rate = parseFloat(json[0]?.valor);
        if (rate > 1000 && rate < 10000) {
          cacheTRM(rate);
          return rate;
        }
      }
    } catch (_) {}

    // Fallback: open.er-api.com
    try {
      const r2 = await fetch("https://open.er-api.com/v6/latest/USD");
      if (r2.ok) {
        const json = await r2.json();
        const rate = json?.rates?.COP;
        if (rate > 1000 && rate < 10000) {
          cacheTRM(rate);
          return rate;
        }
      }
    } catch (_) {}

    // Último recurso: TRM hardcoded reciente (mayo 2026 aprox 3.950 COP/USD)
    return 3950;
  }

  function cacheTRM(rate) {
    try {
      localStorage.setItem(TRM_KEY, JSON.stringify({ rate, fetchedAt: Date.now() }));
    } catch (_) {}
  }

  // 3. Formatear precio
  function formatCOP(amount) {
    const num = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(amount);
    return "COP " + num;
  }

  function formatUSD(amount) {
    return "$" + amount + " USD";
  }

  // 4. Aplicar conversión a todos los [data-price-usd]
  function applyCurrency(currency, trm) {
    const els = document.querySelectorAll("[data-price-usd]");
    els.forEach((el) => {
      const usd = parseFloat(el.getAttribute("data-price-usd"));
      if (!usd || isNaN(usd)) return;

      // Si el elemento tiene un .price-amount hijo, escribimos ahí. Si no, en el propio elemento.
      const target = el.querySelector(".price-amount") || el;

      if (currency === "COP") {
        const cop = Math.round(usd * trm);
        target.textContent = formatCOP(cop);
      } else {
        target.textContent = formatUSD(usd);
      }
    });

    // Estado visual del switcher
    document.querySelectorAll(".currency-switcher__btn").forEach((btn) => {
      const isActive = btn.dataset.currency === currency;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  }

  // 5. Wire up
  async function init() {
    // Render rápido con la heurística síncrona para evitar flash de moneda equivocada
    const localeQuick = detectByLocale() || "USD";
    const trmPromise = getTRM();
    const trm = await trmPromise;
    applyCurrency(localeQuick, trm);

    // Después, refinar con IP (más preciso) en segundo plano
    const finalCurrency = await detectInitialCurrency();
    let currency = finalCurrency;
    applyCurrency(currency, trm);

    document.querySelectorAll(".currency-switcher__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currency = btn.dataset.currency;
        try { localStorage.setItem(STORAGE_KEY, currency); } catch (_) {}
        applyCurrency(currency, trm);
        // Notificar a otros scripts (calculadora) que la moneda cambió
        window.dispatchEvent(new CustomEvent("li:currency-change", { detail: { currency, trm } }));
      });
    });

    // Exponer para uso de la calculadora
    window.__liTRM = trm;
    window.__liCurrency = currency;
    window.dispatchEvent(new CustomEvent("li:currency-ready", { detail: { currency, trm } }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
