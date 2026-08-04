module.exports = {
  testDir: "./tests",
  webServer: {
    command: "node server.js",
    port: 4173,
    env: {
      DATA_DIR: "tests/fixtures/test-data",
      NODE_ENV: "test",
      PORT: "4173",
      LOG_LEVEL: "warn",
      REQUEST_BODY_LIMIT_BYTES: "1048576",
      SECURITY_HEADERS_ENABLED: "true",
      BOOTSTRAP_ADMIN_EMAIL: "admin@socks.test",
      BOOTSTRAP_ADMIN_PASSWORD: "demo1234",
      CSRF_SECRET: "test-csrf-secret",
      SECURITY_HASH_SECRET: "test-security-hash-secret",
      PAYMENT_WEBHOOK_SECRET: "test-payment-webhook-secret",
      ALLOWED_ORIGINS: "http://127.0.0.1:4173",
      GENERAL_RATE_LIMIT: "10000"
    },
    reuseExistingServer: false
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true
  }
};
