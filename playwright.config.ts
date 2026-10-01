import { defineConfig, devices } from "@playwright/test";
import { localSupabase } from "./tests/support/local-supabase";

const PORT = 3100;
const supabase = localSupabase();

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
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Production build against the local Supabase (`npx supabase start`). The gallery
    // is enabled explicitly because it is dev-only otherwise.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      ENABLE_DEV_GALLERY: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: supabase.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
    },
  },
});
