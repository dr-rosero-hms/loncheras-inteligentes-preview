/**
 * <lite-youtube> — Web component facade (~1KB)
 * --------------------------------------------------------
 * Reemplaza el iframe pesado de YouTube por una imagen
 * + botón de play. Solo carga el iframe real al hacer clic.
 * Inspirado en la implementación de Paul Irish, simplificada.
 */
class LiteYT extends HTMLElement {
  connectedCallback() {
    const id = this.getAttribute("videoid");
    if (!id) return;
    const title = this.getAttribute("title") || "Video del Dr. Oscar Rosero";
    const autoloadMuted = this.hasAttribute("autoload-muted");

    // Pre-load thumbnail (sin JS de YouTube)
    this.style.backgroundImage = `url("https://i.ytimg.com/vi/${id}/hqdefault.jpg")`;

    // Botón de play accesible
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lty-playbtn";
    btn.setAttribute("aria-label", `Reproducir: ${title}`);
    this.append(btn);

    // Activación: click o teclado
    const activate = () => this._upgrade(id, false);
    this.addEventListener("click", activate, { once: true });
    btn.addEventListener("focus", () => this._warm(id), { once: true });

    // Warm DNS al hover (accesos más rápidos)
    this.addEventListener("pointerover", () => this._warm(id), { once: true });

    // Autoload muted: arranca el video sin sonido cuando entre al viewport,
    // después de window.load (preserva LCP). El usuario activa audio con click.
    if (autoloadMuted) {
      const triggerMuted = () => {
        if (this._activated) return;
        this._activated = true;
        this._upgrade(id, true);
      };
      const start = () => {
        if (!("IntersectionObserver" in window)) { triggerMuted(); return; }
        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (e.isIntersecting) { triggerMuted(); io.disconnect(); break; }
          }
        }, { threshold: 0.25 });
        io.observe(this);
      };
      if (document.readyState === "complete") start();
      else window.addEventListener("load", start, { once: true });
    }
  }

  _warm(_id) {
    if (this._warmed) return;
    this._warmed = true;
    const links = [
      ["preconnect", "https://www.youtube-nocookie.com"],
      ["preconnect", "https://www.google.com"],
      ["preconnect", "https://googleads.g.doubleclick.net"],
      ["preconnect", "https://static.doubleclick.net"],
    ];
    links.forEach(([rel, href]) => {
      const l = document.createElement("link");
      l.rel = rel;
      l.href = href;
      l.crossOrigin = "anonymous";
      document.head.append(l);
    });
  }

  _upgrade(id, muted) {
    const iframe = document.createElement("iframe");
    iframe.width = "560";
    iframe.height = "315";
    iframe.title = this.getAttribute("title") || "YouTube video player";
    iframe.frameBorder = "0";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    // mute=1 + playsinline=1 son necesarios para que los browsers permitan
    // el autoplay sin gesto del usuario.
    const params = muted
      ? "autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1"
      : "autoplay=1&rel=0";
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?${params}`;
    iframe.style.cssText = "width:100%;height:100%;position:absolute;inset:0;border:0";
    this.innerHTML = "";
    this.append(iframe);
    this.classList.add("lyt-activated");
  }
}
if (!customElements.get("lite-youtube")) {
  customElements.define("lite-youtube", LiteYT);
}
