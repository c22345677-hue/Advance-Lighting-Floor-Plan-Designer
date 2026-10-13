import { defineConfig, devices } from '@playwright/test';

// Browser checks at the sizes the app has to work at: desktop, tablet both ways, a tablet
// showing the app in a narrow frame, and a phone. Runs against the production build.
const touch = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173/', colorScheme: 'dark' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet-landscape', use: { ...devices['Desktop Chrome'], ...touch, viewport: { width: 1480, height: 830 } } },
    { name: 'tablet-portrait', use: { ...devices['Desktop Chrome'], ...touch, viewport: { width: 924, height: 1390 } } },
    { name: 'tablet-narrow-frame', use: { ...devices['Desktop Chrome'], ...touch, viewport: { width: 640, height: 1000 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], ...touch, viewport: { width: 400, height: 820 } } },
  ],
});
