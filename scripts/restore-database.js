const path = require("node:path");
const { createConfig } = require("../lib/config");
const { getDatabasePath } = require("../lib/database");
const { restoreDatabaseBackup } = require("../lib/database-backup");

function parseRestoreArguments(argv) {
  const result = { file: "", confirmation: "" };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key || "argument"}`);
    if (key === "--file") result.file = value;
    else if (key === "--confirm") result.confirmation = value;
    else throw new Error(`Unsupported restore argument: ${key}`);
  }
  if (!result.file) throw new Error("--file is required");
  if (path.basename(result.file) !== result.file) {
    throw new Error("--file must be a backup filename without a path");
  }
  return result;
}

async function runRestore(argv = process.argv.slice(2)) {
  const config = createConfig(process.env);
  const args = parseRestoreArguments(argv);
  const result = await restoreDatabaseBackup({
    archivePath: path.join(config.backup.dir, args.file),
    backupDir: config.backup.dir,
    targetPath: getDatabasePath({ dataDir: config.dataDir, nodeEnv: config.nodeEnv }),
    confirmation: args.confirmation
  });
  const payload = {
    ok: true,
    restoredFrom: path.basename(result.archivePath),
    targetFile: path.basename(result.targetPath),
    preRestoreArchiveFile: path.basename(result.preRestoreArchivePath)
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  return payload;
}

if (require.main === module) {
  runRestore().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: {
        name: error.name || "Error",
        code: error.code || "RESTORE_FAILED"
      }
    })}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseRestoreArguments,
  runRestore
};
