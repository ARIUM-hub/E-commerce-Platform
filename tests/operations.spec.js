const { test, expect } = require("@playwright/test");
const { createConfig } = require("../lib/config");

function createProductionEnv(overrides = {}) {
  return {
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "4173",
    DATA_DIR: "data",
    CSRF_SECRET: "csrf-secret",
    SECURITY_HASH_SECRET: "hash-secret",
    PAYMENT_WEBHOOK_SECRET: "webhook-secret",
    ALLOWED_ORIGINS: "https://shop.example.com",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "mailer",
    SMTP_PASSWORD: "smtp-secret",
    SMTP_FROM: "shop@example.com",
    LOG_FORMAT: "json",
    SERVICE_VERSION: "3e45734",
    PUBLIC_BASE_URL: "https://shop.example.com",
    BACKUP_DIR: "backups",
    BACKUP_LOCAL_RETENTION_DAYS: "7",
    S3_REGION: "auto",
    S3_BUCKET: "socks-backups",
    S3_ACCESS_KEY_ID: "access-key",
    S3_SECRET_ACCESS_KEY: "secret-key",
    ...overrides
  };
}

test("requires complete production operations config", () => {
  expect(() => createConfig(createProductionEnv({ PUBLIC_BASE_URL: "" })))
    .toThrow("PUBLIC_BASE_URL is required in production");
  expect(() => createConfig(createProductionEnv({ LOG_FORMAT: "text" })))
    .toThrow("LOG_FORMAT must be json in production");
  expect(() => createConfig(createProductionEnv({ S3_BUCKET: "" })))
    .toThrow("S3_BUCKET is required in production");

  expect(createConfig(createProductionEnv())).toMatchObject({
    logFormat: "json",
    serviceVersion: "3e45734",
    publicBaseUrl: "https://shop.example.com",
    backup: {
      localRetentionDays: 7
    },
    sentry: {
      environment: "production"
    },
    s3: {
      bucket: "socks-backups",
      region: "auto",
      forcePathStyle: false
    }
  });
});

test("uses safe development operations defaults", () => {
  expect(createConfig({ NODE_ENV: "development" })).toMatchObject({
    logFormat: "text",
    serviceVersion: "development",
    publicBaseUrl: "",
    backup: {
      localRetentionDays: 7
    },
    sentry: {
      dsn: "",
      environment: "development"
    },
    s3: {
      endpoint: "",
      bucket: ""
    }
  });
});
