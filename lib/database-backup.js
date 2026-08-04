const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID, timingSafeEqual } = require("node:crypto");
const { createGzip, createGunzip } = require("node:zlib");
const { pipeline } = require("node:stream/promises");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { createDatabase } = require("./database");

const backupArchivePattern = /^socks-store-\d{8}T\d{6}Z-[a-f0-9]{7,40}\.db\.gz$/;

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

async function cleanupExpiredLocalBackups({ backupDir, retentionDays, now = () => new Date() }) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("retentionDays must be a positive integer");
  }
  const entries = await fsp.readdir(backupDir, { withFileTypes: true });
  const cutoff = now().getTime() - (retentionDays * 24 * 60 * 60 * 1000);
  const removed = [];
  for (const entry of entries) {
    if (!entry.isFile() || !backupArchivePattern.test(entry.name)) continue;
    const archivePath = path.resolve(backupDir, entry.name);
    const archiveStat = await fsp.stat(archivePath);
    if (archiveStat.mtimeMs >= cutoff) continue;

    await fsp.unlink(archivePath);
    removed.push(archivePath);
    const checksumPath = `${archivePath}.sha256`;
    try {
      await fsp.unlink(checksumPath);
      removed.push(checksumPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { removed };
}

function createS3Client(config) {
  return new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region,
    forcePathStyle: Boolean(config.forcePathStyle),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

async function uploadFileWithRetry({
  client,
  bucket,
  key,
  filePath,
  contentType,
  maxAttempts,
  delay
}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const body = fs.createReadStream(filePath);
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType
      }));
      return { key, attempts: attempt };
    } catch (error) {
      body.destroy();
      lastError = error;
      if (attempt < maxAttempts) {
        await delay(1000 * (2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}

async function uploadBackupBundle({
  client,
  bucket,
  archivePath,
  checksumPath,
  maxAttempts = 3,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => new Date()
}) {
  if (!bucket) throw new Error("S3 bucket is required");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error("maxAttempts must be an integer between 1 and 3");
  }
  const date = now();
  const prefix = `sqlite/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const files = [
    { filePath: archivePath, contentType: "application/gzip" },
    { filePath: checksumPath, contentType: "text/plain; charset=utf-8" }
  ];
  const uploads = [];
  for (const file of files) {
    uploads.push(await uploadFileWithRetry({
      client,
      bucket,
      key: `${prefix}/${path.basename(file.filePath)}`,
      filePath: file.filePath,
      contentType: file.contentType,
      maxAttempts,
      delay
    }));
  }
  return { uploads };
}

module.exports = {
  createDatabaseBackup,
  verifyBackupArchive,
  cleanupExpiredLocalBackups,
  createS3Client,
  uploadBackupBundle,
  formatBackupTimestamp
};
