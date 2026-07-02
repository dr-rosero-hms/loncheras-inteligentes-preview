/**
 * Price Sync — lee el precio actual desde /api/hotmart-stats y lo
 * inyecta en todos los elementos [data-price-usd] ANTES de que
 * currency-switcher.js renderice.
 *
 * Permite que el cliente suba/baje el precio en Hotmart y la landing
 * se actualice sola (con cache de 5-60 min en Cloudflare).
 *
 * Patrón:
 *   1. Apenas carga la página, expone window.__liPriceReady (promesa).
 *   2. currency-switcher.js hace `await window.__liPriceReady` antes de
 *      su primer render → siempre dibuja con el precio actualizado.
 *   3. Si el endpoint tarda > 1.2s o falla → resolve con el valor
 *      hardcoded del HTML ($30). El usuario nunca ve un flash de precio.
 *
 * Conteo de estudiantes: también se actualiza si hay elementos
 * [data-students-count] en el HTML.
 */
(() => {
  "use strict";

  const ENDPOINT = "/api/hotmart-stats";
  const TIMEOUT_MS = 1200;
  const CACHE_KEY = "li.price.v1";
  const CACHE_TTL = 10 * 60 * 1000; // 10 min en cliente

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (raw && Date.now() - raw.ts < CACHE_TTL && raw.data) return raw.data;
    } catch (_) {}
    return null;
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch (_) {}
  }

  function applyPriceToDOM(priceUSD) {
    if (!priceUSD || !Number.isFinite(priceUSD) || priceUSD <= 0) return false;
    let changed = false;
    document.querySelectorAll("[data-price-usd]").forEach((el) => {
      const current = parseFloat(el.getAttribute("data-price-usd"));
      if (current !== priceUSD) {
        el.setAttribute("data-price-usd", String(priceUSD));
        changed = true;
      }
    });
    window.LI_CONFIG = window.LI_CONFIG || {};
    window.LI_CONFIG.priceUSD = priceUSD;
    return changed;
  }

  function applyStudentsToDOM(students) {
    if (!students || !Number.isFinite(students) || students <= 0) return;
    const fmt = new Intl.NumberFormat("es-CO");
    document.querySelectorAll("[data-students-count]").forEach((el) => {
      el.textContent = fmt.format(students);
    });
  }

  async function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "force-cache" });
      clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function sync() {
    // 1. Cache rápida del cliente (sin red): repinta inmediato.
    const cached = readCache();
    if (cached?.price_usd) {
      applyPriceToDOM(cached.price_usd);
      applyStudentsToDOM(cached.students);
    }

    // 2. Fetch en paralelo del endpoint serverless (Cloudflare cache 1h).
    try {
      const data = await fetchWithTimeout(ENDPOINT, TIMEOUT_MS);
      if (data && data.price_usd) {
        writeCache(data);
        const changed = applyPriceToDOM(data.price_usd);
        applyStudentsToDOM(data.students);

        // Notificar a currency-switcher para que recalcule si ya corrió.
        if (changed) {
          window.dispatchEvent(
            new CustomEvent("li:price-updated", { detail: data })
          );
        }
        return data;
      }
    } catch (err) {
      // Silent fail: el precio hardcoded en data-price-usd es el fallback.
      // En consola para debug:
      console.warn("[price-sync] usando fallback:", err.message);
    }
    return null;
  }

  // Expone una promesa para que currency-switcher pueda esperar
  // antes de su primer render (evita el flash de precio).
  window.__liPriceReady = sync().catch(() => null);
})();
