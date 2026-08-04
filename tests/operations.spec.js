const { test, expect } = require("@playwright/test");
const { EventEmitter } = require("node:events");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createConfig } = require("../lib/config");
const { createLogger } = require("../lib/logger");
const { createDatabase } = require("../lib/database");

const execFileAsync = promisify(execFile);

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

test("reports sanitized errors and degrades without a DSN", async () => {
  const { createErrorReporter } = require("../lib/monitoring/error-reporter");
  const captured = [];
  let initOptions;
  const sdk = {
    init: (options) => { initOptions = options; },
    captureException: (error, options) => captured.push({ error, options }),
    captureMessage: () => {},
    flush: async () => true
  };
  const reporter = createErrorReporter({
    dsn: "https://public@example.invalid/1",
    environment: "production",
    release: "abc123",
    sdk
  });

  reporter.captureException(new Error("boom"), {
    requestId: "req-12345678",
    cookie: "session-secret",
    route: "/api/orders"
  });
  expect(reporter.enabled).toBe(true);
  expect(initOptions).toEqual(expect.objectContaining({
    dsn: "https://public@example.invalid/1",
    environment: "production",
    release: "abc123",
    sendDefaultPii: false,
    tracesSampleRate: 0
  }));
  expect(captured[0].options.contexts.operation).toEqual({
    requestId: "req-12345678",
    cookie: "[REDACTED]",
    route: "/api/orders"
  });

  const filtered = initOptions.beforeSend({
    request: {
      data: { password: "request-secret" },
      headers: { authorization: "Bearer header-secret", accept: "application/json" }
    },
    user: { id: "user-1", email: "buyer@example.com", ip_address: "127.0.0.1" },
    extra: { token: "raw-token", statusCode: 500 }
  });
  expect(filtered.request.data).toBeUndefined();
  expect(filtered.request.headers.authorization).toBe("[REDACTED]");
  expect(filtered.user).toEqual({ id: "user-1" });
  expect(filtered.extra).toEqual({ token: "[REDACTED]", statusCode: 500 });

  const disabled = createErrorReporter({ dsn: "" });
  expect(disabled.enabled).toBe(false);
  expect(() => disabled.captureException(new Error("ignored"))).not.toThrow();
  await expect(disabled.flush(10)).resolves.toBe(true);
});

test("keeps local error logs when the reporter fails", () => {
  const lines = [];
  const reports = [];
  const logger = createLogger({
    format: "json",
    sink: (line) => lines.push(line),
    reportError: (event, context) => {
      reports.push({ event, context });
      throw new Error("monitor unavailable");
    }
  });

  expect(() => logger.error("checkout.failed", {
    requestId: "request-123",
    token: "raw-secret"
  })).not.toThrow();
  expect(lines).toHaveLength(1);
  expect(reports).toEqual([{
    event: "checkout.failed",
    context: {
      requestId: "request-123",
      token: "[REDACTED]"
    }
  }]);
});

test("closes the server once on repeated SIGTERM", async () => {
  const { registerServerLifecycle } = require("../lib/server-lifecycle");
  const processRef = new EventEmitter();
  processRef.exitCode = 0;
  let closes = 0;
  let flushes = 0;
  const dispose = registerServerLifecycle({
    processRef,
    server: {
      close: (callback) => {
        closes += 1;
        callback();
      },
      closeIdleConnections: () => {}
    },
    logger: { info: () => {}, error: () => {} },
    errorReporter: {
      captureException: () => {},
      flush: async () => {
        flushes += 1;
        return true;
      }
    },
    shutdownTimeoutMs: 50
  });

  processRef.emit("SIGTERM");
  processRef.emit("SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));

  expect(closes).toBe(1);
  expect(flushes).toBe(1);
  expect(processRef.exitCode).toBe(0);
  dispose();
});

test("reports uncaught exceptions before bounded shutdown", async () => {
  const { registerServerLifecycle } = require("../lib/server-lifecycle");
  const processRef = new EventEmitter();
  processRef.exitCode = 0;
  const captured = [];
  let closes = 0;
  const dispose = registerServerLifecycle({
    processRef,
    server: {
      close: (callback) => {
        closes += 1;
        callback();
      },
      closeIdleConnections: () => {}
    },
    logger: { info: () => {}, error: () => {} },
    errorReporter: {
      captureException: (error, context) => captured.push({ error, context }),
      flush: async () => true
    },
    shutdownTimeoutMs: 50
  });
  const error = new Error("unexpected failure");

  processRef.emit("uncaughtException", error);
  await new Promise((resolve) => setImmediate(resolve));

  expect(processRef.exitCode).toBe(1);
  expect(closes).toBe(1);
  expect(captured).toEqual([{
    error,
    context: { source: "uncaughtException" }
  }]);
  dispose();
});

test("contains unhandled request errors at the HTTP boundary", async () => {
  const { createSafeRequestHandler } = require("../lib/http/request-boundary");
  const error = new Error("database unavailable");
  const captured = [];
  const logged = [];
  const responses = [];
  const response = {
    headersSent: false,
    getHeader: (name) => name === "X-Request-Id" ? "request-12345678" : undefined,
    destroy: () => { throw new Error("response should not be destroyed"); }
  };
  const safeHandler = createSafeRequestHandler({
    handleRequest: async () => { throw error; },
    sendError: (...args) => responses.push(args),
    logger: { error: (event, context) => logged.push({ event, context }) },
    errorReporter: {
      captureException: (reportedError, context) => captured.push({ reportedError, context })
    }
  });

  await safeHandler({ url: "/api/orders?token=hidden" }, response);

  expect(captured).toEqual([{
    reportedError: error,
    context: {
      requestId: "request-12345678",
      route: "/api/orders"
    }
  }]);
  expect(logged).toEqual([{
    event: "http.request.unhandled",
    context: {
      requestId: "request-12345678",
      route: "/api/orders",
      name: "Error"
    }
  }]);
  expect(responses).toEqual([[
    response,
    500,
    "INTERNAL_ERROR",
    "Unexpected server error."
  ]]);
});

test("creates an integrity-checked compressed SQLite backup", async ({}, testInfo) => {
  const {
    createDatabaseBackup,
    verifyBackupArchive
  } = require("../lib/database-backup");
  const sourcePath = testInfo.outputPath("source.db");
  const backupDir = testInfo.outputPath("backups");
  const db = createDatabase(sourcePath);
  db.exec("CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES ('kept');");
  db.close();

  const result = await createDatabaseBackup({
    sourcePath,
    backupDir,
    serviceVersion: "abc1234",
    now: () => new Date("2026-08-04T03:30:00.000Z")
  });

  expect(path.basename(result.archivePath))
    .toBe("socks-store-20260804T033000Z-abc1234.db.gz");
  expect(await fs.readFile(result.checksumPath, "utf8"))
    .toBe(`${result.sha256}  ${path.basename(result.archivePath)}\n`);
  expect(result.integrity).toBe("ok");
  await expect(verifyBackupArchive({
    archivePath: result.archivePath,
    checksumPath: result.checksumPath,
    workingDir: backupDir
  })).resolves.toMatchObject({
    integrity: "ok",
    sha256: result.sha256
  });
  await expect(fs.access(`${backupDir}/socks-store-20260804T033000Z-abc1234.db.partial`))
    .rejects.toThrow();
});

test("cleans only expired local backup bundles", async ({}, testInfo) => {
  const { cleanupExpiredLocalBackups } = require("../lib/database-backup");
  const backupDir = testInfo.outputPath("retention");
  await fs.mkdir(backupDir, { recursive: true });
  const oldArchive = path.join(backupDir, "socks-store-20260801T033000Z-abc1234.db.gz");
  const oldChecksum = `${oldArchive}.sha256`;
  const recentArchive = path.join(backupDir, "socks-store-20260808T033000Z-abc1234.db.gz");
  const unrelated = path.join(backupDir, "customer-upload.db.gz");
  await Promise.all([
    fs.writeFile(oldArchive, "old"),
    fs.writeFile(oldChecksum, "old-checksum"),
    fs.writeFile(recentArchive, "recent"),
    fs.writeFile(unrelated, "keep")
  ]);
  const oldDate = new Date("2026-08-01T03:30:00.000Z");
  await Promise.all([
    fs.utimes(oldArchive, oldDate, oldDate),
    fs.utimes(oldChecksum, oldDate, oldDate)
  ]);

  const result = await cleanupExpiredLocalBackups({
    backupDir,
    retentionDays: 7,
    now: () => new Date("2026-08-10T03:30:00.000Z")
  });

  expect(result.removed.map((item) => path.basename(item)).sort()).toEqual([
    path.basename(oldArchive),
    path.basename(oldChecksum)
  ].sort());
  await expect(fs.access(recentArchive)).resolves.toBeUndefined();
  await expect(fs.access(unrelated)).resolves.toBeUndefined();
});

test("uploads S3 backup files serially with bounded retries", async ({}, testInfo) => {
  const { uploadBackupBundle } = require("../lib/database-backup");
  const archivePath = testInfo.outputPath("socks-store-20260810T033000Z-abc1234.db.gz");
  const checksumPath = `${archivePath}.sha256`;
  await fs.writeFile(archivePath, "archive");
  await fs.writeFile(checksumPath, "checksum");
  const calls = [];
  const delays = [];
  const client = {
    async send(command) {
      calls.push(command.input);
      if (calls.length < 3) throw new Error("temporary object storage failure");
      return {};
    }
  };

  const result = await uploadBackupBundle({
    client,
    bucket: "backups",
    archivePath,
    checksumPath,
    maxAttempts: 3,
    delay: async (ms) => delays.push(ms),
    now: () => new Date("2026-08-10T03:30:00.000Z")
  });

  expect(calls).toHaveLength(4);
  expect(delays).toEqual([1000, 2000]);
  expect(result.uploads.map((upload) => upload.attempts)).toEqual([3, 1]);
  expect(calls.map((call) => call.Key)).toEqual([
    "sqlite/2026/08/socks-store-20260810T033000Z-abc1234.db.gz",
    "sqlite/2026/08/socks-store-20260810T033000Z-abc1234.db.gz",
    "sqlite/2026/08/socks-store-20260810T033000Z-abc1234.db.gz",
    "sqlite/2026/08/socks-store-20260810T033000Z-abc1234.db.gz.sha256"
  ]);
});

test("backs up, uploads, and restores a business database without leaking credentials", async ({}, testInfo) => {
  const {
    createDatabaseBackup,
    restoreDatabaseBackup,
    uploadBackupBundle,
    verifyBackupArchive
  } = require("../lib/database-backup");
  const sourcePath = testInfo.outputPath("operations-source.db");
  const targetPath = testInfo.outputPath("operations-target.db");
  const backupDir = testInfo.outputPath("operations-backups");
  const downloadedBackupDir = testInfo.outputPath("operations-downloads");
  const sourceDb = createDatabase(sourcePath);
  sourceDb.exec(`
    CREATE TABLE orders (id TEXT PRIMARY KEY, total INTEGER NOT NULL);
    INSERT INTO orders VALUES ('ORDER-RESTORE-1', 4299);
  `);
  sourceDb.close();
  const targetDb = createDatabase(targetPath);
  targetDb.exec("CREATE TABLE orders (id TEXT PRIMARY KEY, total INTEGER NOT NULL);");
  targetDb.close();

  const backup = await createDatabaseBackup({
    sourcePath,
    backupDir,
    serviceVersion: "abc1234",
    now: () => new Date("2026-08-04T03:30:00.000Z")
  });
  const fakeObjects = new Map();
  const fakeS3 = {
    async send(command) {
      const chunks = [];
      for await (const chunk of command.input.Body) chunks.push(chunk);
      fakeObjects.set(command.input.Key, Buffer.concat(chunks));
      return {};
    }
  };
  const upload = await uploadBackupBundle({
    client: fakeS3,
    bucket: "socks-backups",
    archivePath: backup.archivePath,
    checksumPath: backup.checksumPath,
    now: () => new Date("2026-08-04T03:30:00.000Z")
  });

  await fs.mkdir(downloadedBackupDir, { recursive: true });
  for (const uploaded of upload.uploads) {
    await fs.writeFile(
      path.join(downloadedBackupDir, path.basename(uploaded.key)),
      fakeObjects.get(uploaded.key)
    );
  }
  const downloadedArchivePath = path.join(
    downloadedBackupDir,
    path.basename(backup.archivePath)
  );
  const downloadedChecksumPath = `${downloadedArchivePath}.sha256`;
  await expect(verifyBackupArchive({
    archivePath: downloadedArchivePath,
    checksumPath: downloadedChecksumPath,
    workingDir: downloadedBackupDir
  })).resolves.toMatchObject({ integrity: "ok", sha256: backup.sha256 });
  await restoreDatabaseBackup({
    archivePath: downloadedArchivePath,
    backupDir: downloadedBackupDir,
    targetPath,
    confirmation: "RESTORE",
    now: () => new Date("2026-08-05T04:00:00.000Z")
  });

  const restoredDb = createDatabase(targetPath);
  expect(restoredDb.prepare("SELECT id, total FROM orders").get()).toEqual({
    id: "ORDER-RESTORE-1",
    total: 4299
  });
  restoredDb.close();

  const logLines = [];
  const logger = createLogger({
    format: "json",
    sink: (line) => logLines.push(line),
    now: () => new Date("2026-08-05T04:00:00.000Z")
  });
  logger.info("database.recovery.drill.completed", {
    uploadedFiles: upload.uploads.length,
    s3: {
      accessKeyId: "fake-access-key",
      secretAccessKey: "fake-secret-key"
    }
  });
  expect(logLines).toHaveLength(1);
  expect(JSON.parse(logLines[0])).toMatchObject({
    event: "database.recovery.drill.completed",
    uploadedFiles: 2,
    s3: {
      accessKeyId: "[REDACTED]",
      secretAccessKey: "[REDACTED]"
    }
  });
  expect(logLines[0]).not.toContain("fake-access-key");
  expect(logLines[0]).not.toContain("fake-secret-key");
});

test("runs one local backup from the CLI without object storage", async ({}, testInfo) => {
  const dataDir = testInfo.outputPath("cli-data");
  const backupDir = testInfo.outputPath("cli-backups");
  await fs.mkdir(dataDir, { recursive: true });
  const sourcePath = path.join(dataDir, "socks-store.test.db");
  const db = createDatabase(sourcePath);
  db.exec("CREATE TABLE cli_sample (value TEXT); INSERT INTO cli_sample VALUES ('kept');");
  db.close();

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    path.join(__dirname, "..", "scripts", "backup-database.js")
  ], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATA_DIR: dataDir,
      BACKUP_DIR: backupDir,
      SERVICE_VERSION: "abc1234",
      LOG_LEVEL: "silent",
      NODE_NO_WARNINGS: "1",
      S3_BUCKET: "",
      SENTRY_DSN: ""
    }
  });

  expect(stderr).toBe("");
  const payload = JSON.parse(stdout.trim());
  expect(payload).toEqual(expect.objectContaining({
    ok: true,
    uploaded: false,
    archiveFile: expect.stringMatching(/^socks-store-\d{8}T\d{6}Z-abc1234\.db\.gz$/)
  }));
  await expect(fs.access(path.join(backupDir, payload.archiveFile))).resolves.toBeUndefined();
});

test("restores only verified database backups with explicit confirmation", async ({}, testInfo) => {
  const {
    createDatabaseBackup,
    restoreDatabaseBackup
  } = require("../lib/database-backup");
  const backupDir = testInfo.outputPath("restore-backups");
  const replacementPath = testInfo.outputPath("replacement.db");
  const targetPath = testInfo.outputPath("target.db");
  const replacementDb = createDatabase(replacementPath);
  replacementDb.exec("CREATE TABLE state (value TEXT); INSERT INTO state VALUES ('replacement');");
  replacementDb.close();
  const targetDb = createDatabase(targetPath);
  targetDb.exec("CREATE TABLE state (value TEXT); INSERT INTO state VALUES ('current');");
  targetDb.close();
  const backup = await createDatabaseBackup({
    sourcePath: replacementPath,
    backupDir,
    serviceVersion: "abc1234",
    now: () => new Date("2026-08-01T03:30:00.000Z")
  });

  await expect(restoreDatabaseBackup({
    archivePath: backup.archivePath,
    backupDir,
    targetPath,
    confirmation: "wrong"
  })).rejects.toThrow("Explicit RESTORE confirmation is required");
  await expect(restoreDatabaseBackup({
    archivePath: testInfo.outputPath(path.basename(backup.archivePath)),
    backupDir,
    targetPath,
    confirmation: "RESTORE"
  })).rejects.toThrow("Backup archive must be inside the configured backup directory");

  const validChecksum = await fs.readFile(backup.checksumPath, "utf8");
  await fs.writeFile(
    backup.checksumPath,
    `${"0".repeat(64)}  ${path.basename(backup.archivePath)}\n`
  );
  await expect(restoreDatabaseBackup({
    archivePath: backup.archivePath,
    backupDir,
    targetPath,
    confirmation: "RESTORE"
  })).rejects.toThrow("Backup checksum verification failed");
  await fs.writeFile(backup.checksumPath, validChecksum);

  const result = await restoreDatabaseBackup({
    archivePath: backup.archivePath,
    backupDir,
    targetPath,
    confirmation: "RESTORE",
    now: () => new Date("2026-08-10T04:00:00.000Z")
  });
  const restoredDb = createDatabase(targetPath);
  const restoredRow = restoredDb.prepare("SELECT value FROM state").get();
  restoredDb.close();

  expect(restoredRow.value).toBe("replacement");
  expect(path.basename(result.preRestoreArchivePath))
    .toBe("socks-store-20260810T040000Z-abc1234.db.gz");
  await expect(fs.access(result.preRestoreArchivePath)).resolves.toBeUndefined();
});

test("restores a verified backup from the CLI", async ({}, testInfo) => {
  const { createDatabaseBackup } = require("../lib/database-backup");
  const dataDir = testInfo.outputPath("restore-cli-data");
  const backupDir = testInfo.outputPath("restore-cli-backups");
  await fs.mkdir(dataDir, { recursive: true });
  const targetPath = path.join(dataDir, "socks-store.test.db");
  const replacementPath = testInfo.outputPath("restore-cli-replacement.db");
  const targetDb = createDatabase(targetPath);
  targetDb.exec("CREATE TABLE state (value TEXT); INSERT INTO state VALUES ('current');");
  targetDb.close();
  const replacementDb = createDatabase(replacementPath);
  replacementDb.exec("CREATE TABLE state (value TEXT); INSERT INTO state VALUES ('restored');");
  replacementDb.close();
  const backup = await createDatabaseBackup({
    sourcePath: replacementPath,
    backupDir,
    serviceVersion: "abc1234",
    now: () => new Date("2026-08-02T03:30:00.000Z")
  });

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    path.join(__dirname, "..", "scripts", "restore-database.js"),
    "--file",
    path.basename(backup.archivePath),
    "--confirm",
    "RESTORE"
  ], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      NODE_NO_WARNINGS: "1",
      DATA_DIR: dataDir,
      BACKUP_DIR: backupDir,
      SERVICE_VERSION: "abc1234",
      LOG_LEVEL: "silent"
    }
  });

  expect(stderr).toBe("");
  expect(JSON.parse(stdout)).toEqual(expect.objectContaining({
    ok: true,
    restoredFrom: path.basename(backup.archivePath),
    targetFile: "socks-store.test.db"
  }));
  const restoredDb = createDatabase(targetPath);
  expect(restoredDb.prepare("SELECT value FROM state").get().value).toBe("restored");
  restoredDb.close();
});

test("runs database migrations from the CLI", async ({}, testInfo) => {
  const dataDir = testInfo.outputPath("migration-cli-data");
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    path.join(__dirname, "..", "scripts", "migrate-database.js")
  ], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      NODE_NO_WARNINGS: "1",
      DATA_DIR: dataDir,
      SERVICE_VERSION: "abc1234",
      LOG_LEVEL: "silent"
    }
  });

  expect(stderr).toBe("");
  expect(JSON.parse(stdout)).toEqual({
    ok: true,
    databaseFile: "socks-store.test.db",
    serviceVersion: "abc1234"
  });
  const db = createDatabase(path.join(dataDir, "socks-store.test.db"));
  expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count)
    .toBeGreaterThan(0);
  db.close();
});

test("requires a stopped application before production restore", async () => {
  const script = await fs.readFile(
    path.join(__dirname, "..", "scripts", "restore-production.sh"),
    "utf8"
  );

  expect(script).toContain("set -Eeuo pipefail");
  expect(script).toContain("ps --status running --services");
  expect(script).toContain("grep -qx app");
  expect(script).toContain("app must be stopped before restore");
  expect(script).toContain("node scripts/restore-database.js");
  expect(script).toContain("--confirm RESTORE");
});

test("defines a non-root production container stack", async () => {
  const rootDir = path.join(__dirname, "..");
  const dockerfile = await fs.readFile(path.join(rootDir, "Dockerfile"), "utf8");
  const compose = await fs.readFile(path.join(rootDir, "compose.production.yml"), "utf8");
  const caddy = await fs.readFile(path.join(rootDir, "deploy", "Caddyfile"), "utf8");
  const timer = await fs.readFile(
    path.join(rootDir, "deploy", "systemd", "socks-backup.timer"),
    "utf8"
  );
  const appSection = compose.split("\n  caddy:")[0];

  expect(dockerfile).toContain("FROM node:22-bookworm-slim");
  expect(dockerfile).toContain("npm ci --omit=dev");
  expect(dockerfile).toContain("USER node");
  expect(dockerfile).toContain("/api/ready");
  expect(compose).toContain("name: socks-store");
  expect(appSection).not.toContain("ports:");
  expect(appSection).toContain("expose:");
  expect(compose).toContain("${UPLOAD_DIR_HOST:-./public/uploads}:/app/public/uploads");
  expect(compose).toContain('max-size: "10m"');
  expect(compose).toContain('max-file: "5"');
  expect(compose).toContain('["node", "scripts/backup-database.js"]');
  expect(caddy).toContain("reverse_proxy app:4173");
  expect(caddy).toContain("{$STORE_DOMAIN}");
  expect(timer).toContain("OnCalendar=*-*-* 03:30:00 Asia/Shanghai");
  expect(timer).toContain("Persistent=true");
});

test("keeps CI isolated and single-worker", async () => {
  const workflow = await fs.readFile(
    path.join(__dirname, "..", ".github", "workflows", "ci.yml"),
    "utf8"
  );

  expect(workflow).toContain("pull_request:");
  expect(workflow).toContain("push:");
  expect(workflow).toContain("contents: read");
  expect(workflow).toContain("node-version: 22");
  expect(workflow).toContain("npm run test:api -- --workers=1");
  expect(workflow).toContain("npm run test:ui -- --workers=1");
  expect(workflow).toContain("npm run test:ops -- --workers=1");
  expect(workflow).toContain("playwright install --with-deps chromium");
  expect(workflow).toContain("docker build");
  expect(workflow).toContain("seq 1 20");
  expect(workflow).not.toContain("PRODUCTION_SSH_KEY");
  expect(workflow).not.toContain("S3_SECRET_ACCESS_KEY: ${{ secrets");
  expect(workflow).not.toContain("SENTRY_DSN: ${{ secrets");
});

test("requires approval and bounded rollback for production deployment", async () => {
  const rootDir = path.join(__dirname, "..");
  const workflow = await fs.readFile(
    path.join(rootDir, ".github", "workflows", "deploy-production.yml"),
    "utf8"
  );
  const script = await fs.readFile(
    path.join(rootDir, "scripts", "deploy-production.sh"),
    "utf8"
  );

  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("commit_sha:");
  expect(workflow).toContain("environment: production");
  expect(workflow).toContain("group: production-deployment");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).toMatch(/gh run list .*--workflow ci\.yml/);
  expect(workflow).toContain("PRODUCTION_SSH_KNOWN_HOSTS");
  expect(workflow).toContain("compose.production.yml");
  expect(workflow).toContain("deploy/Caddyfile");
  expect(workflow).not.toContain("ssh-keyscan");
  expect(script).toContain("set -Eeuo pipefail");
  expect(script).toContain("previous_image=");
  expect(script).toContain("--profile ops run --rm backup");
  expect(script).toContain("node scripts/migrate-database.js");
  expect(script).toContain("seq 1 20");
  expect(script).toContain("rollback");
  expect(script).not.toContain("restore-database.js");
  expect(script.indexOf("--profile ops run --rm backup"))
    .toBeLessThan(script.indexOf("pull app"));
});

test("persists the approved image for scheduled backup and restore operations", async () => {
  const rootDir = path.join(__dirname, "..");
  const deployScript = await fs.readFile(
    path.join(rootDir, "scripts", "deploy-production.sh"),
    "utf8"
  );
  const restoreScript = await fs.readFile(
    path.join(rootDir, "scripts", "restore-production.sh"),
    "utf8"
  );
  const backupService = await fs.readFile(
    path.join(rootDir, "deploy", "systemd", "socks-backup.service"),
    "utf8"
  );
  const compose = await fs.readFile(
    path.join(rootDir, "compose.production.yml"),
    "utf8"
  );
  const gitignore = await fs.readFile(path.join(rootDir, ".gitignore"), "utf8");

  expect(deployScript).toContain(".env.image.tmp");
  expect(deployScript).toContain("mv .env.image.tmp .env.image");
  expect(deployScript).toContain("SERVICE_VERSION=%s");
  expect(deployScript).toContain('SERVICE_VERSION="$COMMIT_SHA"');
  expect(deployScript.indexOf("wait_until_ready")).toBeLessThan(
    deployScript.indexOf("mv .env.image.tmp .env.image")
  );
  expect(restoreScript).toContain("source .env.image");
  expect(restoreScript).toContain("export APP_IMAGE");
  expect(restoreScript).toContain("export SERVICE_VERSION");
  expect(backupService).toContain("EnvironmentFile=/opt/socks-store/.env.image");
  expect(compose.match(/SERVICE_VERSION: \$\{SERVICE_VERSION:\?/g)).toHaveLength(2);
  expect(gitignore).toContain(".env.production");
  expect(gitignore).toContain(".env.image");
});

test("documents the complete production operations runbook", async () => {
  const readme = await fs.readFile(path.join(__dirname, "..", "README.md"), "utf8");

  for (const heading of [
    "## 首次部署",
    "## 常规发布",
    "## 备份与 S3 检查",
    "## 受控恢复",
    "## 监控与日志",
    "## 镜像回滚",
    "## 密钥轮换",
    "## 故障升级边界"
  ]) {
    expect(readme).toContain(heading);
  }
  expect(readme).toContain("systemctl status socks-backup.timer");
  expect(readme).toContain("operations.sentry.probe");
  expect(readme).toContain("/api/health");
  expect(readme).toContain("/api/ready");
});

test("routes server runtime errors through the structured logger", async () => {
  const serverSource = await fs.readFile(path.join(__dirname, "..", "server.js"), "utf8");

  expect(serverSource).not.toContain("console.error");
  expect(serverSource).not.toContain("console.log");
  expect(serverSource).toContain('logger.error("data.directory.invalid"');
  expect(serverSource).toContain('logger.error("order.create.failed"');
});
