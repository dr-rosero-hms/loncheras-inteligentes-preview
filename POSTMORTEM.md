# Post-mortem & Playbook — Loncheras Inteligentes (mayo 2026)

Documento de aprendizajes para replicar en próximas landings de cursos/infoproductos.

---

## 🧱 Lo que terminamos entregando

**Stack final:**
- HTML estático + CSS vanilla + 6 islas JS (`lite-yt`, `currency-switcher`, `calculadora`, `test-3plus1`, `sticky-cta`, `analytics`)
- 4 Cloudflare Pages Functions: `/api/test-submit`, `/api/hotmart-stats`, `/api/hotmart-webhook`, fallbacks honestos
- Imágenes locales en WebP + lazy loading (33 fotos del sitio del cliente)
- Tracking config-driven via `window.LI_CONFIG` (Clarity + Pixel + GA4 — solo activan si hay ID)
- Email automation: Brevo API + Make.com webhook
- Microsoft Clarity en producción

**Resultado medible:**
- Payload total: WordPress 4.5 MB → preview **3.3 MB** (incluye todas las fotos)
- Hero LCP image: 2.4 MB PNG → **123 KB WebP** (−95%)
- HTML+CSS+JS: 700 KB → **76 KB** (−89%)
- Mobile scroll total: −1.124 px gracias a paddings compactos
- Multi-currency: 1 país → **6 monedas LATAM** con tasas vivas
- Sticky CTA: ratio arbitrario → **lógica IntersectionObserver coherente**

**URLs:**
- Cloudflare Pages: https://loncheras-inteligentes.pages.dev/
- Repo: https://github.com/dr-rosero-hms/loncheras-inteligentes-preview

---

## 🚨 Errores cometidos (aprender para no repetir)

### 1. Empezar a codear sin abrir el sitio real con Chrome

**Qué pasó:** Construí un rediseño Neubrutalist completo basado en `CLAUDE.md.txt` que dictaba "border 3px sólido, hard-shadows, OKLCH". Cuando el cliente lo vio dijo *"ese estilo está terrible"* y tuve que pivotar a su look real (Tailwind moderno + `#56B221` verde marca).

**Por qué falló:** WebFetch no extrae estilos, solo HTML/texto. El brief abstracto del proyecto != identidad visual real en producción.

**Cómo evitarlo en próximas landings:**
1. **PRIMERO:** abrir el sitio actual del cliente con Chrome MCP
2. Extraer paleta exacta con `getComputedStyle` (no inferir, **medir**)
3. Capturar screenshots de cada sección
4. Confirmar dirección visual antes de escribir CSS

### 2. Inventar contenido para "rellenar marketing"

**Qué pasé inventando:**
- "Bono 3 — Recetario PDF imprimible" *(el sitio real solo tiene 2 bonos)*
- "Valor real $90 USD" tachado + "Ahorras $60 USD hoy" *(números fabricados)*
- "+30 recetas en video" *(las transcripciones solo dan 11 recetas)*
- Costos comparativos COP 7.494 vs COP 3.747 *(estimaciones presentadas como hechos)*
- "Te queda en el bolsillo COP 4.4M" en la calculadora *(asumía que el curso elimina el 100% del gasto, lo cual es falso)*

**Por qué falló:** El cliente lo detectó en cada caso (*"esos bonos no están"*, *"no creo que valga 7mil pesos"*, *"esto incrementa más en la opción de más gasto"*). Costó tiempo y desgastó confianza.

**Cómo evitarlo:**
- **Nunca multiplicar / restar / inflar** sin fuente verificable
- Si hay un dato sin certeza: **dejarlo cualitativo** (`$$$` vs `$`) o pedirlo al cliente
- Para conteos: contar contra **el sitio en producción**, no contra documentos internos
- Si un cálculo asume comportamiento futuro (ahorro, conversión), **decirlo explícitamente** o no mostrarlo

### 3. Aplicar el `CLAUDE.md` como ley sobre la marca real

**Qué pasó:** El proyecto tenía un constitución que decía "Neubrutalismo, Space Grotesk, Bento Grid". Lo apliqué a rajatabla, ignorando el sitio en producción que era moderno-limpio con system-ui font.

**Cómo evitarlo:** El `CLAUDE.md` es **referencia secundaria**. Si choca con la marca en producción del cliente, gana la marca real. Hay un memory persistente sobre esto.

### 4. Heurísticas arbitrarias que se sentían "aleatorias"

**Qué pasó:** El sticky CTA aparecía cuando `window.scrollY / scrollHeight > 0.18`. El usuario reportó *"el botón flotante aparece aleatoriamente"*. Razón: en una página larga, 18% son ~3700 px en mobile y ~3500 px en desktop, sin relación con qué está viendo el usuario.

**Cómo evitarlo:** Toda heurística visual debe tener una **razón observable**. Para sticky CTA: `IntersectionObserver` del CTA del hero — si lo pasaste, aparece; si vuelves al hero, se oculta. Misma lógica en mobile y desktop.

### 5. Mojibake en CSS por falta de `@charset`

**Qué pasó:** `content: "✓"` y `content: "×"` se rendereaban como `âœ"` y `Ã—`.

**Por qué:** Python's `http.server` sirve `.css` sin `charset=UTF-8`, y algunos browsers default a Latin-1 para stylesheets.

**Fix:** Siempre poner `@charset "UTF-8";` como **primera línea** del CSS, además del `<meta charset>` del HTML. Como red de seguridad, usar escapes Unicode (`\2713` en lugar de `✓`).

### 6. Mobile pensado como "shrink del desktop"

**Qué pasó:** Hero split layout en desktop ponía video a la derecha y texto a la izquierda. En mobile el video quedó **debajo** del texto → primer fold sin imagen del Dr. Cliente reportó *"no hay imagen del infoproductor"*.

**Cómo evitarlo:** El **orden visual** en mobile y desktop suele necesitar diferente jerarquía. Patrón: usar `order` o `flex-direction` para que en mobile las cosas con mayor impacto visual (foto del experto, video) aparezcan primero.

### 7. Trust en datos del propio cliente sin verificar contra realidad

**Qué pasó:** "+1.200 estudiantes" lo extraje de la página pública de Hotmart marketplace. El cliente preguntó *"¿de dónde lo sacaste?"*. El CSV que él me dio cubría solo 1 mes con 179 ventas. Tuve que mostrar las dos fuentes y dejarle decidir.

**Cómo evitarlo:** Cuando un dato puede generar duda, mostrar la fuente y permitirle al cliente decidir, en lugar de adoptar uno por defecto.

---

## ✅ Aciertos para replicar

### 1. Inmersión profunda en la voz del experto

Leer las **21 transcripciones** del Dr. Rosero antes de escribir copy permitió usar citas literales (`"No se olviden de la proteína. Esto es fundamental, es necesario."`) en lugar de marketing genérico. El cliente validó: *"déjalo como él habla"*.

**Replicar:** Antes de escribir copy, leer ≥10 piezas de contenido propio del experto. Marcar **tics de lenguaje** que se repiten (en su caso: *"100% comida real"*, *"no se olviden"*, *"ojo con esto"*, *"miren ustedes"*, *"tu cuerpo es lo más sagrado"*).

### 2. Multi-currency con tasas vivas y APIs gratis

`open.er-api.com` (todas las divisas) + `datos.gov.co` (TRM Banco República, oficial Colombia) + `ipapi.co` y `ipwho.is` para geolocation. **Cero auth, cero costo**. Soporta COP/MXN/ARS/CLP/PEN/EUR/USD.

**Replicar:** Si el infoproducto vende en LATAM, usar este stack. La detección por IP + locale + timezone con fallbacks es robusta.

### 3. Calculadora honesta vs. promesa inflada

**Antes:** "Ahorra $4.4M en un año" (asumía 100% reemplazo del gasto).
**Después:** "Recuperas el curso en 9 días" (matemática pura, sin asumir nada).

**Replicar:** Para calculadoras de ahorro/ROI, mostrar **métricas verificables matemáticamente** (días para recuperar, % del gasto anual) en lugar de promesas inventadas.

### 4. `lite-youtube` facade

Un web component de ~1KB que muestra solo el thumbnail hasta que el usuario hace clic. Evita 500-1200ms de scripts de YouTube en el LCP.

**Replicar:** Cualquier landing con video YouTube debe usar facade. Es el ahorro de performance más grande/barato.

### 5. Cloudflare Pages + Functions + secrets

Deploy gratis con tier ilimitado, Functions serverless, secrets cifrados. Equivalente a Vercel/Netlify pero sin límites de bandwidth.

**Replicar:** Para landings de cliente único, este stack es difícil de superar. Auto-deploy en `git push` (con GitHub Actions o connect repo en dashboard).

### 6. Tracking config-driven

`window.LI_CONFIG = { clarityId, metaPixelId, ga4Id }` en `<head>`. Cuando el cliente da los IDs, los pego ahí y los scripts se inyectan solos. Sin IDs, no carga nada (cero costo).

**Replicar:** Patrón limpio para entregar a clientes que activan analytics más tarde.

### 7. Cero credenciales en código

Todas las API keys (Hotmart, Brevo, Make) van como **Cloudflare Pages secrets** (cifrados, no visibles en logs ni repo). El código solo lee `env.BREVO_API_KEY`.

**Replicar:** **Nunca** API keys en HTML/JS. Cloudflare secrets, Vercel env vars o `.env` con `.gitignore`. Si una key se filtra a un repo público, rotarla inmediatamente.

### 8. Test interactivo como lead magnet integrado

Test 3+1 con 6 preguntas + email opcional. Funciona aunque no des email (gratificación inmediata) y captura lead en Brevo + dispara webhook de Make si lo das.

**Replicar:** Cualquier curso con metodología clara puede tener un mini-diagnóstico con la misma estructura. Conversión post-test es mucho mayor que post-blog-post.

### 9. Honestidad cuando hay límites técnicos

Reconocer ante el cliente:
- "+1200 estudiantes lo saqué de Hotmart marketplace, no del CSV que me diste"
- "Cuando cambias precio en Hotmart, NO se actualiza acá automáticamente"
- "Los precios de mito section que puse son inventados, voy a cualitativos"

**Replicar:** El cliente prefiere honestidad temprana ("no lo sé, dame el dato") sobre invención que después tiene que corregir.

### 10. Performance budget desde el inicio

Desde el día 1: HTML+CSS+JS ≤ 100 KB, imágenes en WebP/AVIF con `loading="lazy"`, `defer` en todos los scripts, `preconnect`/`dns-prefetch` para APIs externas, font system stack para evitar CDN externo.

**Replicar:** Si el primer commit del proyecto tiene 500 KB de bundle, ya perdiste. Establecer presupuesto al inicio.

---

## 🛠 Playbook para la próxima landing

### Día 0 — Inmersión (antes de escribir 1 línea de código)

- [ ] Pedir al cliente: brief, transcripciones/videos del experto, CSV de ventas si existen
- [ ] **Abrir el sitio actual con Chrome MCP** (no solo WebFetch)
- [ ] Extraer paleta exacta con `getComputedStyle` en consola
- [ ] Tomar screenshots de cada sección (mobile + desktop)
- [ ] Leer ≥10 piezas de contenido propio del experto, anotar tics de lenguaje
- [ ] Verificar # estudiantes / ventas / precio en la fuente oficial (Hotmart marketplace, dashboard)

### Día 1 — Inventario y plan

- [ ] Listar todas las secciones del sitio actual
- [ ] Identificar problemas de performance (PageSpeed Insights)
- [ ] Identificar problemas de conversión (carruseles, jerarquía visual confusa, copy genérico)
- [ ] Proponer un **diff mínimo** sobre el sitio actual, no rediseño completo
- [ ] Confirmar dirección con cliente antes de codear

### Día 2-3 — Build

- [ ] Empezar con HTML semántico + CSS vanilla
- [ ] Mobile-first siempre, considerar **orden visual** distinto en mobile vs desktop
- [ ] Imágenes: WebP/AVIF + `loading="lazy"` + `width`/`height` (anti-CLS)
- [ ] Scripts: `defer` siempre, islas separadas por funcionalidad
- [ ] `@charset "UTF-8";` como primera línea de cada CSS
- [ ] Multi-currency desde el inicio si vende internacional
- [ ] Tracking config-driven (no hardcodear IDs)

### Día 4 — Integraciones

- [ ] Cloudflare Pages para deploy gratis
- [ ] Cloudflare Pages Functions para endpoints serverless (sync API externa)
- [ ] Cloudflare secrets para credenciales (nunca en código)
- [ ] Microsoft Clarity (free, sin límite de tráfico) — heatmaps + recordings
- [ ] Si captura leads → Brevo + Make.com (o alternativas free)

### Día 5 — Auditoría y deploy

- [ ] Audit técnico: tamaños, anchors rotos, IDs duplicados, alts, jerarquía H, schema
- [ ] Audit visual: cada sección en mobile + desktop
- [ ] Audit de copy: cada frase debe ser verificable contra fuente del experto
- [ ] Verificar redundancias adyacentes (ej. mismo CTA dicho 3 veces seguidas)
- [ ] Deploy a Cloudflare Pages con auto-deploy en `git push`
- [ ] Documentar setup en `SETUP.md`

---

## 📊 Stack reusable (probado y gratis)

```yaml
hosting:        Cloudflare Pages (free, ilimitado)
ci_cd:          GitHub Actions con cloudflare/wrangler-action
serverless:     Cloudflare Pages Functions
tracking:       Microsoft Clarity (free)
email:          Brevo (free 9k/mes) o Resend (free 3k/mes)
automation:     Make (free 1k ops/mes) — opcional
performance:    lite-youtube facade · WebP/AVIF · system fonts · defer scripts
multi_currency: open.er-api.com + datos.gov.co + ipapi.co + ipwho.is
secrets:        Cloudflare secrets (cifrados, nunca en código)
```

---

## 🔑 Lecciones cliente-side que valen para todo proyecto

1. **El cliente sabe más que el documento del proyecto.** El brief es punto de partida, no contrato.
2. **Honestidad temprana > inventar y corregir.** Decir "no sé, pásame el dato" cuesta menos que pivotar después.
3. **Toma decisiones autónomas SOLO si es reversible y verificable.** Cambiar un color es reversible. Inventar un bono no.
4. **El cliente lee con escrutinio.** Cada número, cada bono, cada frase es susceptible de verificación. Asume que va a chequear todo.
5. **Performance es UX**, no un nice-to-have. Si la página tarda 5s en cargar en 4G, la conversión muere antes que la persona lea el copy.
6. **Mobile != desktop reducido.** Es otro contexto de uso. Pensar el orden visual independientemente.
7. **Cero credenciales en código, siempre.** Sin excepciones ni "es solo desarrollo".
