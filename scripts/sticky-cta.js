/**
 * Sticky CTA — Faro de conversión flotante
 * --------------------------------------------------------
 * Aparece tras 18% de scroll. El micro-copy cambia según
 * la sección visible (IntersectionObserver) para que Martha
 * siempre vea el siguiente paso correcto.
 */
(() => {
  "use strict";
  const cta = document.getElementById("sticky-cta");
  const ctaText = document.getElementById("sticky-cta-text");
  if (!cta || !ctaText) return;

  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? window.scrollY / max : 0;
    if (ratio > 0.18) cta.classList.add("is-visible");
    else cta.classList.remove("is-visible");
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

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
    const io = new IntersectionObserver(
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
    sections.forEach((s) => io.observe(s));
  }
})();
