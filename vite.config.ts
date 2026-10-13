import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE_FILE=1 inlines everything into dist/index.html (used for the shareable test build).
// The normal build is the installable web app (manifest, offline cache) and uses relative paths
// so it works from any folder, e.g. GitHub Pages' /<repo>/.
export default defineConfig({
  base: './',
  plugins: [react(), ...(process.env.SINGLE_FILE ? [viteSingleFile()] : [])],
  define: { __SINGLE_FILE__: JSON.stringify(!!process.env.SINGLE_FILE) },
  test: { include: ['src/**/*.test.ts'] },
});
