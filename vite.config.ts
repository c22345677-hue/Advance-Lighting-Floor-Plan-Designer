import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE_FILE=1 inlines everything into dist/index.html (used for the shareable test build).
export default defineConfig({
  plugins: [react(), ...(process.env.SINGLE_FILE ? [viteSingleFile()] : [])],
  test: { include: ['src/**/*.test.ts'] },
});
