import { defineConfig, devices } from "@playwright/test";

const port = process.env.TEST_PORT || 3007;
const reuseServer = process.env.TEST_REUSE_SERVER === "true";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(reuseServer
    ? {}
    : {
        webServer: {
          command: `npx next dev -p ${port}`,
          url: `http://localhost:${port}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
      }),
});
