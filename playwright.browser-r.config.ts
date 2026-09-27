import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3211);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "browser-r.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  timeout: 180_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        env: {
          CLERK_SECRET_KEY: "",
          DATABASE_URL: "",
          EDGE_CONFIG: "",
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
          POSTGRES_URL: "",
          UI_LAYOUT_ADMIN_EMAILS: "",
          UI_LAYOUT_TEST_HARNESS: "true",
          VERCEL_GIT_COMMIT_SHA: "1111111111111111111111111111111111111111",
          WORKSPACE_R_CALCULATIONS_ENABLED: "true",
        },
        reuseExistingServer: false,
        timeout: 180_000,
        url: `${baseURL}/layout-test-harness`,
      },
});
