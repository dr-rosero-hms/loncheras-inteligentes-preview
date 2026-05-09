/**
 * Sticky CTA — Faro de conversión flotante
 * --------------------------------------------------------
 * Lógica clara y consistente entre móvil y desktop:
 *   - Mientras el CTA del HERO está visible → sticky oculto (no necesario)
 *   - Cuando scrolleas más allá del hero → sticky aparece
 *   - Si vuelves al hero → sticky se oculta
 *
 * Bonus: el copy del sticky cambia según la sección visible
 * (Regla 3+1, Test, Testimonios, Bio Dr., Oferta).
 *
 * Anteriormente usaba "ratio > 0.18" que se sentía aleatorio
 * porque el threshold variaba con la altura total del documento.
 */
(() => {
  "use strict";
  const cta = document.getElementById("sticky-cta");
  const ctaText = document.getElementById("sticky-cta-text");
  if (!cta || !ctaText) return;

  // ---------- 1. Visibilidad: aparece SOLO al pasar el CTA del Hero ----------
  // Tres estados posibles:
  //   - Hero CTA por debajo del viewport (aún no lo viste) → ocultar sticky
  //   - Hero CTA visible (lo estás viendo)                 → ocultar sticky
  //   - Hero CTA pasado, arriba del viewport (ya scrolleaste) → mostrar sticky
  const heroCta = document.querySelector(".hero__cta-row") || document.querySelector(".hero .btn");

  const update = () => {
    if (!heroCta) {
      cta.classList.add("is-visible");
      return;
    }
    const r = heroCta.getBoundingClientRect();
    // r.bottom < 0  ⇒ CTA del hero quedó completamente arriba del viewport
    cta.classList.toggle("is-visible", r.bottom < 0);
  };

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();

  // ---------- 2. Copy contextual por sección ----------
  const COPY = {
    regla:       "Ver método 3+1",
    test:        "Inscribirme",
    testimonios: "Quiero esto también",
    doc:         "Inscribirme con el Dr.",
    oferta:      "Empezar ahora",
  };

  const sections = Object.keys(COPY)
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    const ctxObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const id = visible.target.id;
          if (COPY[id]) ctaText.textContent = COPY[id];
        }
      },
      { threshold: [0.25, 0.5, 0.75] }
    );
    sections.forEach((s) => ctxObserver.observe(s));
  }
})();
