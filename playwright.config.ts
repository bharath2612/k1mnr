import { defineConfig } from '@playwright/test';

/**
 * Deliberately small suite. There was no test infrastructure before this work,
 * and a pyramid would be disproportionate. These cover the three failures that
 * would actually hurt:
 *   1. the Astro port broke the homepage
 *   2. a post ships without its SEO/social tags
 *   3. the studio is reachable without the passcode
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4331',
    trace: 'on-first-retry',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 4331',
        url: 'http://localhost:4331/insights',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
