import { defineConfig } from "@playwright/test";

const appUrl = "http://127.0.0.1:3000";
const authUrl = "http://127.0.0.1:54321";
const apiUrl = "http://127.0.0.1:3001";
const production = process.env.CENTS_TEST_PRODUCTION === "1";
const apiOnly = process.env.CENTS_TEST_API_ONLY === "1";

export default defineConfig({
  testDir: "./tests", fullyParallel: false, workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: appUrl, trace: "retain-on-failure" },
  webServer: [
    { command: "node tests/support/supabase-auth-fixture.mjs", url: authUrl + "/health", reuseExistingServer: false },
    {
      command: production ? "npm run start:api" : "npm run dev:api",
      url: apiUrl + "/healthz", reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: authUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
        NEXT_PUBLIC_SITE_URL: appUrl, PORT: "3001",
      },
    },
    {
      command: production ? "npm run start:api" : "npm run dev:api",
      url: "http://127.0.0.1:3002/healthz", reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: authUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
        NEXT_PUBLIC_SITE_URL: "https://cents.example.test", PORT: "3002",
      },
    },
    ...(apiOnly ? [] : [{
      command: production ? "npm run start:web" : "npm run dev:web",
      url: appUrl, reuseExistingServer: false,
      env: { API_ORIGIN: apiUrl },
    }]),
  ],
});
