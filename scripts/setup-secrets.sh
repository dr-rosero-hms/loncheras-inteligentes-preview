#!/bin/bash
# Helper para configurar todos los secrets de Cloudflare Pages.
# Ejecuta interactivamente: te pide cada valor uno por uno.
# Si dejas un valor vacío, se omite ese secret.
#
# Uso:  bash scripts/setup-secrets.sh
#
# Requiere wrangler logged in (npx wrangler login).

set -e

PROJECT="loncheras-inteligentes"
SECRETS=(
  "HOTMART_CLIENT_ID|Client ID de Hotmart (Configuración → API y Webhooks)"
  "HOTMART_CLIENT_SECRET|Client Secret de Hotmart"
  "HOTMART_PRODUCT_ID|Product ID Hotmart (default K100999555X)"
  "HOTMART_WEBHOOK_TOKEN|Token de validación que pegas en el webhook de Hotmart"
  "BREVO_API_KEY|API Key v3 de Brevo (xkeysib-...)"
  "BREVO_LIST_ID|ID numérico de la lista en Brevo (ej. 5)"
  "BREVO_SENDER_EMAIL|Email del remitente (oscar@academiacomidareal.com)"
  "BREVO_SENDER_NAME|Nombre del remitente (Dr. Oscar Rosero)"
  "MAKE_WEBHOOK_URL|URL del webhook de Make (https://hook.eu1.make.com/...)"
  "SLACK_WEBHOOK_URL|Slack Incoming Webhook URL"
  "DISCORD_WEBHOOK_URL|Discord Webhook URL"
  "RESEND_API_KEY|API Key de Resend (re_...) — alternativa a Brevo para emails transaccionales"
  "NOTIFICATION_EMAIL|Email donde recibes notificaciones de compra"
)

echo "🔐 Setup de secrets para $PROJECT"
echo "Si dejas un valor vacío, ese secret se omite."
echo ""

for entry in "${SECRETS[@]}"; do
  KEY="${entry%%|*}"
  DESC="${entry##*|}"
  echo "──────────────────────────────────────────"
  echo "[$KEY]"
  echo "  $DESC"
  read -r -s -p "  Valor (Enter para omitir): " VALUE
  echo ""
  if [ -z "$VALUE" ]; then
    echo "  ⏭  Omitido"
    continue
  fi
  echo "$VALUE" | npx wrangler pages secret put "$KEY" --project-name="$PROJECT" 2>&1 | tail -3
  echo "  ✅ Configurado"
done

echo ""
echo "✨ Listo. Re-deployá para que los secrets surtan efecto:"
echo "   npx wrangler pages deploy . --project-name=$PROJECT --branch=main"
