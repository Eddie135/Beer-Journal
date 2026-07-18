export default {
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    actionTimeout: 5000,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm build:test && pnpm run preview:test",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120000,
  },
};
