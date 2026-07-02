/**
 * Sticky CTA — Faro de conversión flotante
 * --------------------------------------------------------
 * Regla: el sticky aparece SOLO cuando ningún botón principal está en pantalla,
 * y se oculta (con transición) en cuanto uno vuelve a verse. Así nunca duplica
 * un CTA que ya está disponible. La transición de entrada/salida la maneja el CSS
 * (opacity + translateY). Copy fijo = el CTA principal de la landing.
 */
(() => {
  "use strict";
  const cta = document.getElementById("sticky-cta");
  if (!cta) return;

  // Faros = los botones de COMPRA reales (hero + oferta) + la tarjeta de oferta.
  // Excluye el sticky mismo (#sticky-cta también lleva .hotmart__button-checkout) y
  // los botones intermedios href="#empezar", que solo hacen scroll y NO son CTAs de compra.
  const beacons = [
    ...document.querySelectorAll('a.hotmart__button-checkout:not(#sticky-cta)'),
    document.querySelector("#empezar .oferta__card"),
  ].filter(Boolean);

  // Sin IntersectionObserver o sin faros: mostrar tras el primer fold.
  if (!("IntersectionObserver" in window) || !beacons.length) {
    const onScroll = () =>
      cta.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.9);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return;
  }

  const visible = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      });
      // Visible solo si NINGÚN CTA principal está en pantalla.
      cta.classList.toggle("is-visible", visible.size === 0);
    },
    { threshold: 0 }
  );
  beacons.forEach((b) => io.observe(b));
})();
