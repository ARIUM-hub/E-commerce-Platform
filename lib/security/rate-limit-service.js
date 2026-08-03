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

module.exports = {
  createMemoryRateLimiter
};
