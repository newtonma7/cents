import { defineConfig } from "@playwright/test";

const appUrl = "http://127.0.0.1:3000";
const authUrl = "http://127.0.0.1:54321";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/support/supabase-auth-fixture.mjs",
      url: `${authUrl}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev",
      url: appUrl,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: authUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
        NEXT_PUBLIC_SITE_URL: appUrl,
      },
    },
  ],
});
