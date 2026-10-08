# Advance Lighting Floor Plan Designer

Top-down lighting floor plans for cinematography, at real-world scale. Includes photo
calibration, sun path, automatic equipment lists, kits, cloud sync and PNG/PDF export.

See [PLAN.md](PLAN.md) for the product and technical plan.

## Development

```sh
npm install
npm run dev            # local dev server
npm test               # unit tests (Vitest)
npm run typecheck      # TypeScript
npm run build:preview  # single-file test build → dist/preview.html
```

- `src/app/` — the editor UI (React + Konva canvas)
- `src/model/` — document types and geometry helpers
- `src/templates/` — template engine; layouts live in `src/templates/library/`
