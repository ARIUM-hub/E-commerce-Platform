const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const allowedLogLevels = new Set(["debug", "info", "warn", "error", "silent"]);
const allowedLogFormats = new Set(["text", "json"]);

function parseIntegerEnv(env, key, defaultValue, { min, max }) {
  const rawValue = env[key];
  const value = rawValue === undefined || rawValue === "" ? defaultValue : Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function parseBooleanEnv(env, key, defaultValue) {
  const rawValue = env[key];
  if (rawValue === undefined || rawValue === "") return defaultValue;
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  throw new Error(`${key} must be true or false`);
}

function requireProductionValue(env, key, nodeEnv) {
  const value = String(env[key] || "").trim();
  if (nodeEnv === "production" && !value) {
    throw new Error(`${key} is required in production`);
  }
  return value;
}

function parseAllowedOrigins(value, fallbackOrigin) {
  const origins = String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...new Set(origins.length ? origins : [fallbackOrigin])];
}

function parseHttpsUrl(env, key, nodeEnv) {
  const value = requireProductionValue(env, key, nodeEnv);
  if (!value) return "";

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
  if (nodeEnv === "production" && url.protocol !== "https:") {
    throw new Error(`${key} must use https in production`);
  }
  return url.origin;
}

function createConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "development").trim() || "development";
  const dataDirValue = String(env.DATA_DIR || "data").trim();
  if (!dataDirValue) {
    throw new Error("DATA_DIR cannot be empty");
  }

  const logLevel = String(env.LOG_LEVEL || (nodeEnv === "test" ? "warn" : "info")).trim();
  if (!allowedLogLevels.has(logLevel)) {
    throw new Error("LOG_LEVEL must be one of debug, info, warn, error, silent");
  }
  const logFormat = String(env.LOG_FORMAT || (nodeEnv === "production" ? "json" : "text")).trim();
  if (!allowedLogFormats.has(logFormat)) {
    throw new Error("LOG_FORMAT must be one of text, json");
  }
  if (nodeEnv === "production" && logFormat !== "json") {
    throw new Error("LOG_FORMAT must be json in production");
  }

  const host = String(env.HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = parseIntegerEnv(env, "PORT", 4173, { min: 0, max: 65535 });
  const nonProductionPrefix = nodeEnv === "test" ? "test" : "development";
  const csrfSecret = requireProductionValue(env, "CSRF_SECRET", nodeEnv)
    || `${nonProductionPrefix}-csrf-secret`;
  const securityHashSecret = requireProductionValue(env, "SECURITY_HASH_SECRET", nodeEnv)
    || `${nonProductionPrefix}-security-hash-secret`;
  const paymentWebhookSecret = requireProductionValue(env, "PAYMENT_WEBHOOK_SECRET", nodeEnv)
    || `${nonProductionPrefix}-payment-webhook-secret`;
  const allowedOriginsValue = requireProductionValue(env, "ALLOWED_ORIGINS", nodeEnv);
  const smtpHost = requireProductionValue(env, "SMTP_HOST", nodeEnv);
  if (nodeEnv === "production" && env.SMTP_SECURE === undefined) {
    throw new Error("SMTP_SECURE is required in production");
  }
  const smtpUser = requireProductionValue(env, "SMTP_USER", nodeEnv);
  const smtpPassword = requireProductionValue(env, "SMTP_PASSWORD", nodeEnv);
  const smtpFrom = requireProductionValue(env, "SMTP_FROM", nodeEnv);
  const serviceVersion = requireProductionValue(env, "SERVICE_VERSION", nodeEnv)
    || "development";
  const publicBaseUrl = parseHttpsUrl(env, "PUBLIC_BASE_URL", nodeEnv);
  const backupDirValue = requireProductionValue(env, "BACKUP_DIR", nodeEnv)
    || "backups";
  const s3Region = requireProductionValue(env, "S3_REGION", nodeEnv) || "auto";
  const s3Bucket = requireProductionValue(env, "S3_BUCKET", nodeEnv);
  const s3AccessKeyId = requireProductionValue(env, "S3_ACCESS_KEY_ID", nodeEnv);
  const s3SecretAccessKey = requireProductionValue(env, "S3_SECRET_ACCESS_KEY", nodeEnv);

  return {
    rootDir,
    host,
    port,
    dataDir: path.resolve(rootDir, dataDirValue),
    nodeEnv,
    isTest: nodeEnv === "test" || dataDirValue.includes(path.join("tests", "fixtures", "test-data")),
    bootstrapAdminEmail: String(env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase(),
    bootstrapAdminPassword: String(env.BOOTSTRAP_ADMIN_PASSWORD || ""),
    logLevel,
    logFormat,
    serviceVersion,
    publicBaseUrl,
    requestBodyLimitBytes: parseIntegerEnv(env, "REQUEST_BODY_LIMIT_BYTES", 1048576, {
      min: 1024,
      max: 10485760
    }),
    securityHeadersEnabled: parseBooleanEnv(env, "SECURITY_HEADERS_ENABLED", true),
    csrfSecret,
    securityHashSecret,
    paymentWebhookSecret,
    allowedOrigins: parseAllowedOrigins(allowedOriginsValue, `http://${host}:${port}`),
    trustProxy: parseBooleanEnv(env, "TRUST_PROXY", false),
    generalRateLimit: parseIntegerEnv(env, "GENERAL_RATE_LIMIT", 120, { min: 1, max: 100000 }),
    auditRetentionDays: parseIntegerEnv(env, "AUDIT_RETENTION_DAYS", 180, { min: 1, max: 3650 }),
    smtp: {
      host: smtpHost,
      port: parseIntegerEnv(env, "SMTP_PORT", 587, { min: 1, max: 65535 }),
      secure: parseBooleanEnv(env, "SMTP_SECURE", false),
      user: smtpUser,
      password: smtpPassword,
      from: smtpFrom
    },
    sentry: {
      dsn: String(env.SENTRY_DSN || "").trim(),
      environment: String(env.SENTRY_ENVIRONMENT || nodeEnv).trim() || nodeEnv
    },
    backup: {
      dir: path.resolve(rootDir, backupDirValue),
      localRetentionDays: parseIntegerEnv(env, "BACKUP_LOCAL_RETENTION_DAYS", 7, {
        min: 1,
        max: 365
      })
    },
    s3: {
      endpoint: String(env.S3_ENDPOINT || "").trim(),
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
      forcePathStyle: parseBooleanEnv(env, "S3_FORCE_PATH_STYLE", false)
    }
  };
}

module.exports = {
  createConfig
};
