import { defineConfig } from '@playwright/test';

const PORT = 4173;
// Software WebGL, so the game renders on machines without a graphics card (CI included).
const launchOptions = {
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  // Set PLAYWRIGHT_CHROMIUM to use a browser that is already installed.
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
};
const phone = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 };

/**
 * Automated playtests. They build the real game, open it in a browser and play it:
 *   desktop       keyboard and mouse at 1280 x 720
 *   phone         the web version on a phone held sideways, played by touch
 *   mobile-app    the single-file build the Expo app loads, served the way the app serves it
 *
 * Run with: npm test
 */
export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: `http://localhost:${PORT}/`, launchOptions, trace: 'off' },
  webServer: {
    // The tests run against the production build, the same files GitHub Pages serves.
    command: `npm run build && npm run build:mobile && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', testMatch: /(game|desktop)\.spec\.ts/, use: { viewport: { width: 1280, height: 720 } } },
    { name: 'phone', testMatch: /(game|touch)\.spec\.ts/, use: phone },
    { name: 'mobile-app', testMatch: /(game|touch|app)\.spec\.ts/, use: phone },
  ],
});
