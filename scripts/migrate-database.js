const path = require("node:path");
const { createConfig } = require("../lib/config");
const {
  createDatabase,
  initializeDatabase,
  getDatabasePath
} = require("../lib/database");

function runMigrations() {
  const config = createConfig(process.env);
  const databasePath = getDatabasePath({ dataDir: config.dataDir, nodeEnv: config.nodeEnv });
  const db = createDatabase(databasePath);
  try {
    initializeDatabase(db);
  } finally {
    db.close();
  }
  const payload = {
    ok: true,
    databaseFile: path.basename(databasePath),
    serviceVersion: config.serviceVersion
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  return payload;
}

if (require.main === module) {
  try {
    runMigrations();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: {
        name: error.name || "Error",
        code: error.code || "MIGRATION_FAILED"
      }
    })}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  runMigrations
};
