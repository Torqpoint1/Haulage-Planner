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
  webServer: [
    {
      // Stand-in for postcodes.io (see e2e/support/mock-postcodes.mjs).
      command: "node e2e/support/mock-postcodes.mjs",
      url: "http://localhost:3199/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Stand-in for OpenRouteService (see e2e/support/mock-ors.mjs).
      command: "node e2e/support/mock-ors.mjs",
      url: "http://localhost:3198/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Stand-in for Resend (see e2e/support/mock-resend.mjs).
      command: "node e2e/support/mock-resend.mjs",
      url: "http://localhost:3197/health",
      reuseExistingServer: !process.env.CI,
    },
    {
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
        POSTCODES_API_URL: "http://localhost:3199",
        ORS_API_URL: "http://localhost:3198",
        RESEND_API_URL: "http://localhost:3197",
        RESEND_API_KEY: "re_test",
        EMAIL_FROM: "Haulage Planner <noreply@example.test>",
        OPERATOR_EMAIL: "operator@example.test",
      },
    },
  ],
});
