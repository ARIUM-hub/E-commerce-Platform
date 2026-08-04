const levelRank = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};

const sensitiveKeyPattern = /password|token|cookie|authorization|signature|smtp|secret|email|\bip\b/i;

function sanitizeLogContext(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogContext(item, seen));
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    sensitiveKeyPattern.test(key) ? "[REDACTED]" : sanitizeLogContext(item, seen)
  ]));
}

function serializeContext(context) {
  if (!context || Object.keys(context).length === 0) {
    return "";
  }
  return ` ${JSON.stringify(context)}`;
}

function createLogger({
  level = "info",
  format = "text",
  baseContext = {},
  sink = console.log,
  reportError,
  now = () => new Date()
} = {}) {
  const minimumRank = levelRank[level] ?? levelRank.info;

  function write(entryLevel, event, context = {}) {
    if ((levelRank[entryLevel] ?? levelRank.info) < minimumRank) {
      return;
    }
    const timestamp = now().toISOString();
    const safeContext = sanitizeLogContext({ ...baseContext, ...context });
    if (format === "json") {
      sink(JSON.stringify({ ...safeContext, timestamp, level: entryLevel, event }));
    } else {
      sink(`${timestamp} [${entryLevel}] ${event}${serializeContext(safeContext)}`);
    }
    if (entryLevel === "error" && typeof reportError === "function") {
      try {
        const reportResult = reportError(event, safeContext);
        reportResult?.catch?.(() => {});
      } catch {
        // Error reporting must never interrupt the application log path.
      }
    }
  }

  return {
    debug: (event, context) => write("debug", event, context),
    info: (event, context) => write("info", event, context),
    warn: (event, context) => write("warn", event, context),
    error: (event, context) => write("error", event, context)
  };
}

module.exports = {
  createLogger,
  sanitizeLogContext
};
