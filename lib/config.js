const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const allowedLogLevels = new Set(["debug", "info", "warn", "error", "silent"]);

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

  return {
    rootDir,
    host: String(env.HOST || "127.0.0.1").trim() || "127.0.0.1",
    port: parseIntegerEnv(env, "PORT", 4173, { min: 0, max: 65535 }),
    dataDir: path.resolve(rootDir, dataDirValue),
    nodeEnv,
    isTest: nodeEnv === "test" || dataDirValue.includes(path.join("tests", "fixtures", "test-data")),
    logLevel,
    requestBodyLimitBytes: parseIntegerEnv(env, "REQUEST_BODY_LIMIT_BYTES", 1048576, {
      min: 1024,
      max: 10485760
    }),
    securityHeadersEnabled: parseBooleanEnv(env, "SECURITY_HEADERS_ENABLED", true)
  };
}

module.exports = {
  createConfig
};
