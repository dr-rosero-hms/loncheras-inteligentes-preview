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
4. Configura esas credenciales en el endpoint PHP de SiteGround (`/api/hotmart-stats`), fuera del webroot público:
   ```
   HOTMART_CLIENT_ID = <pega_aquí>
   HOTMART_CLIENT_SECRET = <pega_aquí>
   HOTMART_PRODUCT_ID = K100999555X
   ```
5. El endpoint `/api/hotmart-stats` (PHP en SiteGround) empezará a devolver datos vivos

> Nota: la versión JS original de este endpoint (Cloudflare Pages Functions) quedó en `functions/` solo como referencia histórica. Producción corre en PHP en SiteGround.

### 5️⃣ Webhook de notificaciones de compra

**Por qué:** te llega notificación instantánea (Slack, Discord o email) cada vez que alguien compra el curso.

**Setup Slack/Discord:**
1. Crea un Incoming Webhook en tu Slack o Discord
2. Configura los secrets en el endpoint PHP del webhook en SiteGround:
   ```
   SLACK_WEBHOOK_URL = https://hooks.slack.com/...
   DISCORD_WEBHOOK_URL = https://discord.com/api/webhooks/...
   ```
3. En Hotmart → Webhooks → Add webhook:
   - URL: la del endpoint del webhook en producción (SiteGround)
   - Eventos: `PURCHASE_APPROVED`, `PURCHASE_COMPLETE`
   - Token: genera uno aleatorio y guárdalo como `HOTMART_WEBHOOK_TOKEN` junto a los demás secrets del endpoint

**Setup Email (Resend):**
1. Crea cuenta en https://resend.com (3.000 emails/mes gratis)
2. Verifica tu dominio (academiacomidareal.com)
3. Genera API key y guárdala como `RESEND_API_KEY` junto a los demás secrets del endpoint
4. Define `NOTIFICATION_EMAIL = oscar@academiacomidareal.com` (donde quieres recibir)

### 6️⃣ Auto-deploy en cada `git push` (CI/CD)

**Cómo funciona:** cada push a `main` (o un run manual con "Run workflow") dispara `.github/workflows/deploy.yml`, que despliega a **SiteGround (producción)** vía rsync sobre SSH (puerto 18765):

- `site/` → `${SITEGROUND_PATH}/cursoloncheras/` (la landing)
- `api/` → `${SITEGROUND_PATH}/api/` (endpoints PHP, ej. `/api/hotmart-stats`)
- Al final hace flush de la caché de SiteGround (`site-tools-client domain-all update id=1 flush_cache=1`); si falla, el deploy queda subido igual.

Los rsync corren **sin `--delete`** a propósito: el servidor tiene páginas WordPress y otras carpetas que no están en el repo y no deben borrarse.

**Setup (una sola vez):** añade estos secrets en GitHub:
1. https://github.com/dr-rosero-hms/loncheras-inteligentes-preview/settings/secrets/actions
2. New repository secret:
   - `SITEGROUND_SSH_KEY` → llave privada SSH autorizada en SiteGround (formato OpenSSH)
   - `SITEGROUND_USER` → usuario SSH de SiteGround
   - `SITEGROUND_HOST` → host SSH de SiteGround
   - `SITEGROUND_PATH` → ruta base del webroot (sin slash final)

> Nota: Cloudflare Pages fue solo el preview histórico de esta landing; **no** es producción. Producción vive en SiteGround y se despliega únicamente con este workflow.

---

## 🚀 Mi recomendación de orden de setup

1. **Microsoft Clarity** (10 min) — datos de heatmaps reales desde día 1
2. **Auto-deploy con GitHub Actions** (5 min) — configura los secrets `SITEGROUND_*` y cada push despliega solo a producción
3. **Hotmart API** (15 min) — precio sincronizado automáticamente
4. **Webhook compras** (15 min) — dopamina + pulso del negocio en tiempo real
5. **Meta Pixel** (cuando vayas a hacer ads) — remarketing
6. **GA4** (cuando quieras dashboards de tráfico)

---

## URLs

- 🌐 Producción (SiteGround): la landing vive en `/cursoloncheras/` del webroot del dominio del Dr. Rosero
- 📦 Repo: https://github.com/dr-rosero-hms/loncheras-inteligentes-preview
- 🛠 Endpoint Hotmart sync (PHP en SiteGround): `/api/hotmart-stats` en el dominio de producción
- 🌐 Cloudflare Pages (solo preview histórico, NO producción): https://loncheras-inteligentes.pages.dev/
