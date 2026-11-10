import { defineConfig } from "@playwright/test";
import { BASE_URL, SESSION_STORAGE_KEY, seededSession } from "./e2e/fixtures";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    browserName: "chromium",
    // The IWSDK Vite plugin always serves HTTPS with a local certificate.
    ignoreHTTPSErrors: true,
    // Lesson tests start signed in. e2e/auth.spec.ts overrides this to test the login itself.
    storageState: {
      cookies: [],
      origins: [{ origin: BASE_URL, localStorage: [{ name: SESSION_STORAGE_KEY, value: seededSession() }] }],
    },
    // iwsdk.config.json skips the Quest emulator for this marker, so tests keep their mock WebXR.
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 MMA-E2E",
    launchOptions: {
      args: [
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    command: "pnpm --filter @mma/web dev:runtime --host 127.0.0.1 --port 5174",
    url: BASE_URL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
