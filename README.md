# Loncheras Inteligentes — Preview

Landing page de preview para el curso **Loncheras Inteligentes** del Dr. Oscar Rosero (médico endocrinólogo).

## Stack

- HTML estático + CSS vanilla con tokens OKLCH
- Tailwind-style font stack (system UI sans-serif)
- 3 islas JS: currency switcher (TRM Banco República), calculadora honesta, test 3+1 con validación tipo Zod
- `lite-youtube` facade (video del Dr. solo carga al hacer clic)
- 33 imágenes locales en `assets/imgs/` extraídas del sitio Astro original

## Estructura

```
.
├── index.html
├── styles/
│   ├── tokens.css        # Paleta #56B221 + escala
│   └── styles.css        # Componentes
├── scripts/
│   ├── lite-yt.js        # YouTube facade
│   ├── currency-switcher.js  # COP/USD auto-detect IP
│   ├── calculadora.js    # Calc honesta (días para recuperar)
│   ├── test-3plus1.js    # Test del método con voz Dr.
│   └── sticky-cta.js     # CTA flotante contextual
└── assets/imgs/          # 33 webp + 1 png (5.7MB)
```

## Dev local

```bash
python3 -m http.server 4321
# abrir http://localhost:4321
```

## Notas de copy

Todos los textos del Dr. Rosero entre comillas son citas literales de las 21 transcripciones del curso. Cero alucinaciones. Bonos verificados contra el sitio en producción.

<!-- deploy check 2026-06-30T20:04:52Z -->
