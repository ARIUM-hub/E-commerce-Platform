const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID, timingSafeEqual } = require("node:crypto");
const { createGzip, createGunzip } = require("node:zlib");
const { pipeline } = require("node:stream/promises");
const { createDatabase } = require("./database");

function formatBackupTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function quoteSqliteString(value) {
  return String(value).replace(/'/g, "''");
}

function readIntegrityResult(db) {
  const row = db.prepare("PRAGMA integrity_check").get();
  return String(Object.values(row || {})[0] || "");
}

async function calculateFileSha256(filePath) {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function assertPathMissing(filePath) {
  try {
    await fsp.access(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Backup output already exists: ${path.basename(filePath)}`);
}

async function removeDatabaseArtifacts(filePath) {
  await Promise.all([
    fsp.rm(filePath, { force: true }),
    fsp.rm(`${filePath}-wal`, { force: true }),
    fsp.rm(`${filePath}-shm`, { force: true })
  ]);
}

async function createDatabaseBackup({
  sourcePath,
  backupDir,
  serviceVersion,
  now = () => new Date()
}) {
  const normalizedVersion = String(serviceVersion || "").trim().toLowerCase();
  if (!/^[a-f0-9]{7,40}$/.test(normalizedVersion)) {
    throw new Error("serviceVersion must be a 7 to 40 character hexadecimal revision");
  }
  await fsp.stat(sourcePath);
  await fsp.mkdir(backupDir, { recursive: true });

  const timestamp = formatBackupTimestamp(now());
  const baseName = `socks-store-${timestamp}-${normalizedVersion}.db`;
  const snapshotPath = path.resolve(backupDir, `${baseName}.partial`);
  const archivePath = path.resolve(backupDir, `${baseName}.gz`);
  const archivePartialPath = `${archivePath}.partial`;
  const checksumPath = `${archivePath}.sha256`;
  await Promise.all([
    assertPathMissing(snapshotPath),
    assertPathMissing(archivePath),
    assertPathMissing(archivePartialPath),
    assertPathMissing(checksumPath)
  ]);

  let archiveCreated = false;
  try {
    const sourceDb = createDatabase(sourcePath);
    try {
      sourceDb.exec(`VACUUM INTO '${quoteSqliteString(snapshotPath)}'`);
    } finally {
      sourceDb.close();
    }

    const snapshotDb = createDatabase(snapshotPath);
    let integrity;
    try {
      integrity = readIntegrityResult(snapshotDb);
    } finally {
      snapshotDb.close();
    }
    if (integrity !== "ok") {
      throw new Error("SQLite backup integrity check failed");
    }

    await pipeline(
      fs.createReadStream(snapshotPath),
      createGzip({ level: 9 }),
      fs.createWriteStream(archivePartialPath, { flags: "wx" })
    );
    const sha256 = await calculateFileSha256(archivePartialPath);
    await fsp.rename(archivePartialPath, archivePath);
    archiveCreated = true;
    await fsp.writeFile(
      checksumPath,
      `${sha256}  ${path.basename(archivePath)}\n`,
      { encoding: "utf8", flag: "wx" }
    );
    const archiveStat = await fsp.stat(archivePath);
    return {
      archivePath,
      checksumPath,
      sha256,
      integrity,
      sizeBytes: archiveStat.size,
      createdAt: now().toISOString(),
      serviceVersion: normalizedVersion
    };
  } catch (error) {
    await fsp.rm(archivePartialPath, { force: true });
    if (archiveCreated) {
      await fsp.rm(archivePath, { force: true });
      await fsp.rm(checksumPath, { force: true });
    }
    throw error;
  } finally {
    await removeDatabaseArtifacts(snapshotPath);
  }
}

async function verifyBackupArchive({ archivePath, checksumPath, workingDir }) {
  const checksum = (await fsp.readFile(checksumPath, "utf8")).trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error("Backup checksum file is invalid");
  }
  const sha256 = await calculateFileSha256(archivePath);
  const checksumBuffer = Buffer.from(checksum, "hex");
  const actualBuffer = Buffer.from(sha256, "hex");
  if (!timingSafeEqual(checksumBuffer, actualBuffer)) {
    throw new Error("Backup checksum verification failed");
  }

  await fsp.mkdir(workingDir, { recursive: true });
  const verificationPath = path.resolve(
    workingDir,
    `.${path.basename(archivePath)}.${randomUUID()}.verify.db`
  );
  try {
    await pipeline(
      fs.createReadStream(archivePath),
      createGunzip(),
      fs.createWriteStream(verificationPath, { flags: "wx" })
    );
    const db = createDatabase(verificationPath);
    let integrity;
    try {
      integrity = readIntegrityResult(db);
    } finally {
      db.close();
    }
    if (integrity !== "ok") {
      throw new Error("SQLite backup integrity check failed");
    }
    return { sha256, integrity };
  } finally {
    await removeDatabaseArtifacts(verificationPath);
  }
}

module.exports = {
  createDatabaseBackup,
  verifyBackupArchive,
  formatBackupTimestamp
};
