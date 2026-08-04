const { sanitizeLogContext } = require("../logger");

function sanitizeSentryEvent(event = {}) {
  const sanitized = sanitizeLogContext(event);
  if (sanitized.request) {
    delete sanitized.request.data;
    delete sanitized.request.cookies;
  }
  if (sanitized.user) {
    sanitized.user = sanitized.user.id ? { id: sanitized.user.id } : undefined;
  }
  return sanitized;
}

function createDisabledReporter() {
  return {
    enabled: false,
    captureException() {},
    captureMessage() {},
    async flush() {
      return true;
    }
  };
}

function createErrorReporter({
  dsn = "",
  environment = "development",
  release = "development",
  sdk,
  logger
} = {}) {
  if (!dsn) return createDisabledReporter();

  const sentry = sdk || require("@sentry/node");
  try {
    sentry.init({
      dsn,
      environment,
      release,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: sanitizeSentryEvent
    });
  } catch {
    logger?.warn?.("monitoring.initialization.failed");
    return createDisabledReporter();
  }

  return {
    enabled: true,
    captureException(error, context = {}) {
      try {
        sentry.captureException(error, {
          contexts: {
            operation: sanitizeLogContext(context)
          }
        });
      } catch {
        logger?.warn?.("monitoring.capture.failed");
      }
    },
    captureMessage(event, context = {}) {
      try {
        sentry.captureMessage(event, {
          level: "error",
          contexts: {
            operation: sanitizeLogContext(context)
          }
        });
      } catch {
        logger?.warn?.("monitoring.capture.failed");
      }
    },
    async flush(timeoutMs = 2000) {
      try {
        return Boolean(await sentry.flush(Math.min(Math.max(timeoutMs, 0), 2000)));
      } catch {
        return false;
      }
    }
  };
}

module.exports = {
  createErrorReporter,
  sanitizeSentryEvent
};
