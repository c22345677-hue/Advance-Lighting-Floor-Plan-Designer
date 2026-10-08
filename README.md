# Advance Lighting Floor Plan Designer

Top-down lighting floor plans for cinematography, at real-world scale. Includes photo
calibration, sun path, automatic equipment lists, kits, cloud sync and PNG/PDF export.

See [PLAN.md](PLAN.md) for the product and technical plan.

## Development

```sh
npm install
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript
```

- `src/model/` — document types and geometry helpers
- `src/templates/` — template engine; layouts live in `src/templates/library/`
