import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-GB",
    timezoneId: "Europe/London",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build so screenshots match what ships; the gallery is
    // enabled explicitly because it is dev-only otherwise.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/today`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { ENABLE_DEV_GALLERY: "1", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
