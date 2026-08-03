function getTimestamp(now) {
  const value = now();
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error("RATE_LIMIT_TIME_INVALID");
  }
  return timestamp;
}

function createMemoryRateLimiter({ limit, windowMs, now = () => new Date() }) {
  const requestLimit = Number(limit);
  const durationMs = Number(windowMs);
  if (!Number.isInteger(requestLimit) || requestLimit <= 0
    || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("RATE_LIMIT_CONFIG_INVALID");
  }
  const buckets = new Map();

  function consume(key) {
    const identifier = String(key || "unknown");
    const currentTime = getTimestamp(now);
    let bucket = buckets.get(identifier);
    if (!bucket || currentTime - bucket.windowStartedAt >= durationMs) {
      bucket = { windowStartedAt: currentTime, count: 0 };
      buckets.set(identifier, bucket);
    }
    if (bucket.count >= requestLimit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.windowStartedAt + durationMs - currentTime) / 1000)
        )
      };
    }
    bucket.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, requestLimit - bucket.count),
      retryAfterSeconds: 0
    };
  }

  function reset() {
    buckets.clear();
  }

  return { consume, reset };
}

function createPersistentRateLimiter({ withDatabase, hashIdentifier, now = () => new Date() }) {
  function normalizeIdentifiers(identifiers) {
    return (identifiers || [])
      .filter((identifier) => identifier?.type && identifier?.value)
      .map((identifier) => ({
        type: String(identifier.type),
        keyHash: hashIdentifier(identifier.value, identifier.type)
      }));
  }

  function getPolicyLimit(policy, type) {
    const limit = Number(policy?.limits?.[type] ?? policy?.limit);
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("RATE_LIMIT_POLICY_INVALID");
    }
    return limit;
  }

  function check(action, identifiers, policy) {
    const currentTime = getTimestamp(now);
    let retryAfterSeconds = 0;
    withDatabase((db) => {
      const findBucket = db.prepare(`
        SELECT blocked_until FROM security_rate_limit_buckets
        WHERE key_hash = ? AND action = ?
      `);
      for (const identifier of normalizeIdentifiers(identifiers)) {
        getPolicyLimit(policy, identifier.type);
        const row = findBucket.get(identifier.keyHash, action);
        const blockedUntil = row?.blocked_until ? Date.parse(row.blocked_until) : 0;
        if (blockedUntil > currentTime) {
          retryAfterSeconds = Math.max(
            retryAfterSeconds,
            Math.ceil((blockedUntil - currentTime) / 1000)
          );
        }
      }
    });
    return retryAfterSeconds > 0
      ? { allowed: false, retryAfterSeconds }
      : { allowed: true, retryAfterSeconds: 0 };
  }

  function recordFailure(action, identifiers, policy) {
    const currentTime = getTimestamp(now);
    const currentIso = new Date(currentTime).toISOString();
    const windowMs = Number(policy?.windowMs);
    const blockMs = Number(policy?.blockMs);
    if (!Number.isFinite(windowMs) || windowMs <= 0
      || !Number.isFinite(blockMs) || blockMs <= 0) {
      throw new Error("RATE_LIMIT_POLICY_INVALID");
    }
    withDatabase((db) => {
      const update = db.transaction(() => {
        const findBucket = db.prepare(`
          SELECT window_started_at, attempt_count, failure_count
          FROM security_rate_limit_buckets
          WHERE key_hash = ? AND action = ?
        `);
        const saveBucket = db.prepare(`
          INSERT INTO security_rate_limit_buckets (
            key_hash, action, window_started_at, attempt_count,
            failure_count, blocked_until, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(key_hash, action) DO UPDATE SET
            window_started_at = excluded.window_started_at,
            attempt_count = excluded.attempt_count,
            failure_count = excluded.failure_count,
            blocked_until = excluded.blocked_until,
            updated_at = excluded.updated_at
        `);
        for (const identifier of normalizeIdentifiers(identifiers)) {
          const limit = getPolicyLimit(policy, identifier.type);
          const row = findBucket.get(identifier.keyHash, action);
          const windowStartedAt = row ? Date.parse(row.window_started_at) : 0;
          const windowExpired = !Number.isFinite(windowStartedAt)
            || currentTime - windowStartedAt >= windowMs;
          const attemptCount = windowExpired ? 1 : Number(row.attempt_count) + 1;
          const failureCount = windowExpired ? 1 : Number(row.failure_count) + 1;
          const blockedUntil = failureCount >= limit
            ? new Date(currentTime + blockMs).toISOString()
            : null;
          saveBucket.run(
            identifier.keyHash,
            action,
            windowExpired ? currentIso : row.window_started_at,
            attemptCount,
            failureCount,
            blockedUntil,
            currentIso
          );
        }
      });
      update();
    });
    return check(action, identifiers, policy);
  }

  function recordSuccess(action, identifiers) {
    return withDatabase((db) => {
      const removeBucket = db.prepare(`
        DELETE FROM security_rate_limit_buckets WHERE key_hash = ? AND action = ?
      `);
      const remove = db.transaction(() => {
        let removed = 0;
        for (const identifier of normalizeIdentifiers(identifiers)) {
          removed += Number(removeBucket.run(identifier.keyHash, action).changes);
        }
        return removed;
      });
      return remove();
    });
  }

  return { check, recordFailure, recordSuccess };
}

module.exports = {
  createMemoryRateLimiter,
  createPersistentRateLimiter
};
