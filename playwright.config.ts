import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3210);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--enable-unsafe-swiftshader",
            "--enable-webgl",
            "--ignore-gpu-blocklist",
            "--use-angle=swiftshader",
            "--use-gl=angle",
          ],
        },
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        env: {
          CLERK_SECRET_KEY: "",
          DATABASE_URL: "",
          EDGE_CONFIG: "",
          EQUIPMENT_CATALOG_CHANNEL: "staging",
          EQUIPMENT_EXPLORER_ENABLED: "1",
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
          NEXT_PUBLIC_EQUIPMENT_EXPLORER: "1",
          POSTGRES_URL: "",
          UI_LAYOUT_ADMIN_EMAILS: "",
          UI_LAYOUT_TEST_HARNESS: "true",
        },
        reuseExistingServer: false,
        timeout: 180_000,
        url: baseURL,
      },
});
