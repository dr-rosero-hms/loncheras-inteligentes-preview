/**
 * Analytics & Tracking — config-driven
 * --------------------------------------------------------
 * Para activar cada herramienta, pega tu ID en la config global
 * que está en <head> del index.html. Si el ID está vacío,
 * el script no inyecta nada (cero costo).
 *
 * IDs esperados:
 *   window.LI_CONFIG = {
 *     clarityId: "abc123def4",     // Microsoft Clarity (heatmaps)
 *     metaPixelId: "1234567890",   // Meta Pixel (Instagram/FB Ads)
 *     ga4Id: "G-XXXXXXXXXX",       // Google Analytics 4
 *     hotmartProductId: "K100999555X"
 *   }
 *
 * Eventos que disparan automáticamente:
 *   - PageView (todas las herramientas)
 *   - InitiateCheckout (cuando el usuario clica un CTA hacia Hotmart)
 *   - Lead (cuando completa el Test 3+1)
 *   - ViewContent (en módulos clave)
 */
(() => {
  "use strict";
  const cfg = window.LI_CONFIG || {};

  // ---------- Microsoft Clarity (heatmaps + grabaciones) ----------
  if (cfg.clarityId) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", cfg.clarityId);
  }

  // ---------- Meta Pixel ----------
  if (cfg.metaPixelId) {
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    fbq("init", cfg.metaPixelId);
    fbq("track", "PageView");
  }

  // ---------- Google Analytics 4 ----------
  if (cfg.ga4Id) {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + cfg.ga4Id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", cfg.ga4Id);
  }

  // ---------- Helpers de eventos cross-platform ----------
  window.liTrack = function (eventName, params = {}) {
    try { if (window.fbq) fbq("track", eventName, params); } catch (_) {}
    try { if (window.gtag) gtag("event", eventName.toLowerCase(), params); } catch (_) {}
    try { if (window.clarity) clarity("event", eventName); } catch (_) {}
  };

  // ---------- Auto-track: clicks a Hotmart ----------
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href*="pay.hotmart.com"], a[href*="hotmart.com"]');
    if (!a) return;
    window.liTrack("InitiateCheckout", {
      content_name: "Loncheras Inteligentes",
      content_ids: [cfg.hotmartProductId || "K100999555X"],
      content_type: "course",
      currency: window.__liCurrency || "USD",
      value: 30,
    });
  });

  // ---------- Auto-track: completar Test 3+1 ----------
  const testForm = document.getElementById("test-3plus1");
  if (testForm) {
    testForm.addEventListener("submit", () => {
      window.liTrack("Lead", { source: "test-3plus1", category: "lead-magnet" });
    });
  }

  // ---------- Auto-track: scroll milestones ----------
  let maxScroll = 0;
  const milestones = [25, 50, 75, 100];
  const reached = new Set();
  window.addEventListener("scroll", () => {
    const dh = document.documentElement.scrollHeight - window.innerHeight;
    if (dh <= 0) return;
    const pct = Math.round((window.scrollY / dh) * 100);
    if (pct > maxScroll) maxScroll = pct;
    for (const m of milestones) {
      if (pct >= m && !reached.has(m)) {
        reached.add(m);
        window.liTrack("ScrollDepth", { percent: m });
      }
    }
  }, { passive: true });
})();
