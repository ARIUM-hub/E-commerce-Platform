const { test, expect } = require("@playwright/test");
const { EventEmitter } = require("node:events");
const { createConfig } = require("../lib/config");
const { createLogger } = require("../lib/logger");

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

test("writes redacted production JSON logs", () => {
  const lines = [];
  const circular = { statusCode: 200 };
  circular.self = circular;
  const logger = createLogger({
    level: "info",
    format: "json",
    baseContext: {
      environment: "production",
      serviceVersion: "abc123"
    },
    sink: (line) => lines.push(line),
    now: () => new Date("2026-08-04T00:00:00.000Z")
  });

  logger.debug("request.hidden", { statusCode: 100 });
  logger.info("request.completed", {
    requestId: "req-12345678",
    password: "password-secret",
    nested: {
      authorization: "Bearer authorization-secret",
      statusCode: 200
    },
    circular
  });

  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toEqual({
    timestamp: "2026-08-04T00:00:00.000Z",
    level: "info",
    event: "request.completed",
    environment: "production",
    serviceVersion: "abc123",
    requestId: "req-12345678",
    password: "[REDACTED]",
    nested: {
      authorization: "[REDACTED]",
      statusCode: 200
    },
    circular: {
      statusCode: 200,
      self: "[CIRCULAR]"
    }
  });
  expect(lines[0]).not.toContain("password-secret");
  expect(lines[0]).not.toContain("authorization-secret");
});

test("validates and propagates request ids", () => {
  const { createRequestContext } = require("../lib/http/request-context");
  const acceptedHeaders = {};
  const accepted = createRequestContext({
    headers: { "x-request-id": "edge-request-123" }
  }, {
    setHeader: (name, value) => { acceptedHeaders[name] = value; }
  }, {
    now: () => 1000,
    randomUUID: () => "generated-request-id"
  });

  expect(accepted.requestId).toBe("edge-request-123");
  expect(acceptedHeaders["X-Request-Id"]).toBe("edge-request-123");
  expect(accepted.complete(2000)).toEqual({ durationMs: 1000 });

  const generatedHeaders = {};
  const generated = createRequestContext({
    headers: { "x-request-id": "bad id" }
  }, {
    setHeader: (name, value) => { generatedHeaders[name] = value; }
  }, {
    now: () => 1000,
    randomUUID: () => "generated-request-id"
  });

  expect(generated.requestId).toBe("generated-request-id");
  expect(generatedHeaders["X-Request-Id"]).toBe("generated-request-id");
});

test("logs HTTP completion once without query parameters", () => {
  const {
    createRequestContext,
    attachRequestCompletionLog
  } = require("../lib/http/request-context");
  const response = new EventEmitter();
  response.statusCode = 201;
  response.setHeader = () => {};
  let currentTime = 1000;
  const requestContext = createRequestContext({ headers: {}, method: "POST" }, response, {
    now: () => currentTime,
    randomUUID: () => "generated-request-id"
  });
  const entries = [];

  attachRequestCompletionLog({
    request: { method: "POST" },
    response,
    requestUrl: new URL("https://shop.example.com/api/orders?token=hidden"),
    requestContext,
    logger: { info: (event, context) => entries.push({ event, context }) }
  });
  currentTime = 1045;
  response.emit("finish");
  response.emit("close");

  expect(entries).toEqual([{
    event: "http.request.completed",
    context: {
      requestId: "generated-request-id",
      method: "POST",
      route: "/api/orders",
      statusCode: 201,
      durationMs: 45
    }
  }]);
});
