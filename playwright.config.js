module.exports = {
  testDir: "./tests",
  webServer: {
    command: "node server.js",
    port: 4173,
    env: {
      DATA_DIR: "tests/fixtures/test-data",
      NODE_ENV: "test",
      PORT: "4173"
    },
    reuseExistingServer: false
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true
  }
};
