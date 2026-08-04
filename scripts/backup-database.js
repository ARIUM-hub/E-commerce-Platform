const path = require("node:path");
const { createConfig } = require("../lib/config");
const { getDatabasePath } = require("../lib/database");
const { createLogger } = require("../lib/logger");
const { createErrorReporter } = require("../lib/monitoring/error-reporter");
const {
  createDatabaseBackup,
  cleanupExpiredLocalBackups,
  createS3Client,
  uploadBackupBundle
} = require("../lib/database-backup");

async function runBackup() {
  const config = createConfig(process.env);
  const errorReporter = createErrorReporter({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.serviceVersion
  });
  const logger = createLogger({
    level: config.logLevel,
    format: config.logFormat,
    baseContext: {
      environment: config.nodeEnv,
      serviceVersion: config.serviceVersion
    },
    reportError: (event, context) => errorReporter.captureMessage(event, context)
  });

  try {
    const backup = await createDatabaseBackup({
      sourcePath: getDatabasePath({ dataDir: config.dataDir, nodeEnv: config.nodeEnv }),
      backupDir: config.backup.dir,
      serviceVersion: config.serviceVersion
    });
    const cleanup = await cleanupExpiredLocalBackups({
      backupDir: config.backup.dir,
      retentionDays: config.backup.localRetentionDays
    });
    let upload = null;
    if (config.s3.bucket) {
      upload = await uploadBackupBundle({
        client: createS3Client(config.s3),
        bucket: config.s3.bucket,
        archivePath: backup.archivePath,
        checksumPath: backup.checksumPath
      });
    }
    const result = {
      ok: true,
      archiveFile: path.basename(backup.archivePath),
      checksumFile: path.basename(backup.checksumPath),
      sha256: backup.sha256,
      sizeBytes: backup.sizeBytes,
      uploaded: Boolean(upload),
      uploadedFiles: upload?.uploads.length || 0,
      removedLocalFiles: cleanup.removed.length
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } catch (error) {
    errorReporter.captureException(error, { operation: "database_backup" });
    logger.error("database.backup.failed", {
      name: error.name || "Error",
      code: error.code || ""
    });
    await errorReporter.flush(2000);
    throw error;
  }
}

if (require.main === module) {
  runBackup().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: {
        name: error.name || "Error",
        code: error.code || "BACKUP_FAILED"
      }
    })}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  runBackup
};
