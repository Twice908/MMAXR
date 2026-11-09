import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    browserName: "chromium",
    // The IWSDK Vite plugin always serves HTTPS with a local certificate.
    ignoreHTTPSErrors: true,
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
    url: "https://127.0.0.1:5174",
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});