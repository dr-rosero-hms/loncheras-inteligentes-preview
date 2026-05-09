# Setup de automatizaciones — Loncheras Inteligentes

Esta página te lleva paso a paso por las integraciones disponibles. Todas son **opcionales** y "config-driven": si dejas un campo vacío, esa integración simplemente no se activa (cero costo).

---

## 🟢 Ya activas (sin tu input)

### Multi-currency LATAM (6 monedas con tasas vivas)
Detección automática por IP + tasa viva. Soporta:
- 🇨🇴 COP (Banco República, oficial)
- 🇲🇽 MXN
- 🇦🇷 ARS
- 🇨🇱 CLP
- 🇵🇪 PEN
- 🇪🇸 EUR
- 🇺🇸 USD (default + países dolarizados)

APIs gratis sin auth: `open.er-api.com` (todas las monedas vs USD) + `datos.gov.co` (TRM oficial Colombia).

### Tracking de eventos automático
Si pones los IDs en `LI_CONFIG`, el sistema dispara eventos automáticos cross-platform:
- **PageView** (al cargar)
- **InitiateCheckout** (clic en cualquier CTA hacia Hotmart)
- **Lead** (al completar el Test 3+1)
- **ScrollDepth** (25%, 50%, 75%, 100%)

---

## 🟡 Listas para activar (necesitan tus credenciales)

### 1️⃣ Microsoft Clarity — heatmaps + grabaciones de sesión

**Por qué:** ves dónde Martha mueve el mouse, dónde duda, dónde abandona. Gratis sin límite de tráfico.

**Setup (3 minutos):**
1. Ve a https://clarity.microsoft.com/ → "Get started" → login con tu Google/Microsoft
2. Create new project → "Loncheras Inteligentes" → URL del sitio
3. Copia el **Project ID** (ej. `abc123def4`)
4. Pégalo en `index.html`:
   ```js
   window.LI_CONFIG = {
     clarityId: "abc123def4",  // ← aquí
     ...
   }
   ```
5. Push a git → auto-deploy

### 2️⃣ Meta Pixel — remarketing en Instagram/Facebook

**Por qué:** los visitantes que NO compran en primera visita pueden ser re-impactados con ads en IG/FB. Recupera 10-15% de conversión.

**Setup:**
1. Ve a https://business.facebook.com/ → Events Manager → Connect Data Sources → Web → Pixel
2. Pixel name: "Loncheras Inteligentes"
3. Copia el **Pixel ID** (16 dígitos)
4. Pégalo en `LI_CONFIG.metaPixelId`

### 3️⃣ Google Analytics 4 — analítica completa

**Por qué:** dashboards de tráfico, fuentes, comportamiento. Funciona con Google Ads.

**Setup:**
1. https://analytics.google.com/ → Admin → Create Property
2. Property name: "Loncheras Inteligentes" → Web stream → URL
3. Copia el **Measurement ID** (formato `G-XXXXXXXXXX`)
4. Pégalo en `LI_CONFIG.ga4Id`

### 4️⃣ Hotmart API — sync precio + estudiantes en tiempo real

**Por qué:** cuando cambias el precio en Hotmart, se actualiza solo en la landing. El conteo "+1.200 estudiantes" se mantiene actualizado automáticamente.

**Setup:**
1. En Hotmart → Configuración → API y Webhooks → "Crear credencial"
2. Permisos: `marketplace.products.read`, `payments.sales.read`
3. Copia `Client ID` + `Client Secret`
4. En Cloudflare Pages → tu proyecto → Settings → Environment variables → Production → Add:
   ```
   HOTMART_CLIENT_ID = <pega_aquí>
   HOTMART_CLIENT_SECRET = <pega_aquí>
   HOTMART_PRODUCT_ID = K100999555X
   ```
5. Re-deploy → el endpoint `/api/hotmart-stats` empezará a devolver datos vivos

### 5️⃣ Webhook de notificaciones de compra

**Por qué:** te llega notificación instantánea (Slack, Discord o email) cada vez que alguien compra el curso.

**Setup Slack/Discord:**
1. Crea un Incoming Webhook en tu Slack o Discord
2. En Cloudflare Pages secrets:
   ```
   SLACK_WEBHOOK_URL = https://hooks.slack.com/...
   DISCORD_WEBHOOK_URL = https://discord.com/api/webhooks/...
   ```
3. En Hotmart → Webhooks → Add webhook:
   - URL: `https://loncheras-inteligentes.pages.dev/api/hotmart-webhook`
   - Eventos: `PURCHASE_APPROVED`, `PURCHASE_COMPLETE`
   - Token: genera uno aleatorio y guárdalo como `HOTMART_WEBHOOK_TOKEN` en Cloudflare

**Setup Email (Resend):**
1. Crea cuenta en https://resend.com (3.000 emails/mes gratis)
2. Verifica tu dominio (academiacomidareal.com)
3. Genera API key y guárdala como `RESEND_API_KEY` en Cloudflare
4. Define `NOTIFICATION_EMAIL = oscar@academiacomidareal.com` (donde quieres recibir)

### 6️⃣ Auto-deploy en cada `git push` (CI/CD)

**Por qué:** ahora cada cambio que pusheas a GitHub se despliega solo en Cloudflare Pages. No tienes que ejecutar `wrangler pages deploy` cada vez.

**Setup (5 minutos):**

**Opción A — Conectar repo en Cloudflare dashboard (más fácil):**
1. https://dash.cloudflare.com/ → Pages → loncheras-inteligentes → Settings → Builds & deployments
2. Connect to Git → autoriza GitHub → selecciona el repo `loncheras-inteligentes-preview`
3. Production branch: `main` · Build command: (vacío) · Output: `/`
4. Listo: cada push despliega solo

**Opción B — GitHub Actions (más control):**
El archivo `.github/workflows/deploy.yml` ya está listo. Solo añade los secrets en GitHub:
1. https://github.com/cesarsumosa/loncheras-inteligentes-preview/settings/secrets/actions
2. New repository secret:
   - `CLOUDFLARE_API_TOKEN` → genera uno en https://dash.cloudflare.com/profile/api-tokens (template "Edit Cloudflare Workers")
   - `CLOUDFLARE_ACCOUNT_ID` → `4a8bb1e3427bbe94800bb38cd33e5f3b`

---

## 🚀 Mi recomendación de orden de setup

1. **Microsoft Clarity** (10 min) — datos de heatmaps reales desde día 1
2. **Auto-deploy via dashboard** (5 min) — para no depender de mí para cada cambio
3. **Hotmart API** (15 min) — precio sincronizado automáticamente
4. **Webhook compras** (15 min) — dopamina + pulso del negocio en tiempo real
5. **Meta Pixel** (cuando vayas a hacer ads) — remarketing
6. **GA4** (cuando quieras dashboards de tráfico)

---

## URLs activas

- 🌐 Cloudflare Pages: https://loncheras-inteligentes.pages.dev/
- 🌐 GitHub Pages (mirror): https://cesarsumosa.github.io/loncheras-inteligentes-preview/
- 📦 Repo: https://github.com/cesarsumosa/loncheras-inteligentes-preview
- 🛠 Endpoint Hotmart sync (cuando configures secrets): https://loncheras-inteligentes.pages.dev/api/hotmart-stats
- 🔔 Webhook Hotmart (URL para pegar en Hotmart): https://loncheras-inteligentes.pages.dev/api/hotmart-webhook
