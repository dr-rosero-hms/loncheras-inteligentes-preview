# Loncheras Inteligentes — Preview

Landing page del curso **Loncheras Inteligentes** del Dr. Oscar Rosero (médico endocrinólogo). Este repo contiene la copia versionada del sitio en producción (SiteGround) y su pipeline de deploy.

## Stack

- HTML estático + CSS vanilla con tokens OKLCH
- Tailwind-style font stack (system UI sans-serif)
- Islas JS: currency switcher (TRM Banco República), calculadora honesta, test 3+1 con validación tipo Zod, price-sync con Hotmart
- `lite-youtube` facade (video del Dr. solo carga al hacer clic)
- Imágenes locales en `site/assets/imgs/`

## Estructura

```
.
├── site/                 # Sitio en producción (SiteGround: /cursoloncheras/)
│   ├── index.html
│   ├── styles/           # tokens.css + styles.css
│   ├── scripts/          # currency-switcher, calculadora, test-3plus1, price-sync, etc.
│   ├── assets/imgs/      # webp del curso
│   └── _astro/           # assets del build Astro original
├── api/                  # Endpoints PHP en SiteGround (los añade otro proceso; hoy solo .gitkeep)
├── functions/            # Referencia histórica: Cloudflare Pages Functions (JS) del preview
├── legacy-preview/       # Extras del preview que no llegaron a producción
└── .github/workflows/deploy.yml  # CI de deploy a SiteGround
```

## Deploy (flujo real)

Push a `main` → GitHub Actions (`.github/workflows/deploy.yml`) → `rsync` sobre SSH (puerto 18765) a SiteGround:

- `site/` → `${SITEGROUND_PATH}/cursoloncheras/`
- `api/` → `${SITEGROUND_PATH}/api/`
- Flush de la caché de SiteGround al final (tolerante a fallos).

Los rsync corren **sin `--delete`**: el servidor tiene páginas WordPress y otras carpetas que no viven en este repo.

El endpoint `/api/hotmart-stats` (sync de precio/estudiantes con Hotmart) corre en **PHP en SiteGround**, no en Cloudflare. La carpeta `functions/` conserva la versión JS original solo como referencia.

## Dev local

```bash
cd site
python3 -m http.server 4321
# abrir http://localhost:4321
```

## Notas de copy

Todos los textos del Dr. Rosero entre comillas son citas literales de las 21 transcripciones del curso. Cero alucinaciones. Bonos verificados contra el sitio en producción.
