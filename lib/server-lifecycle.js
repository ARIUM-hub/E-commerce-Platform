function registerServerLifecycle({
  processRef = process,
  server,
  logger,
  errorReporter,
  shutdownTimeoutMs = 10_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) {
  let shutdownPromise = null;

  function beginShutdown({ source, error } = {}) {
    if (shutdownPromise) return shutdownPromise;

    if (error) {
      processRef.exitCode = 1;
      errorReporter.captureException(error, { source });
      logger.error("process.unhandled", {
        source,
        name: error.name || "Error"
      });
    } else {
      logger.info("process.shutdown.started", { source });
    }

    shutdownPromise = new Promise((resolve) => {
      server.close((closeError) => resolve({ closeError }));
      server.closeIdleConnections?.();
    }).then(async ({ closeError }) => {
      if (closeError) {
        processRef.exitCode = 1;
        logger.error("process.shutdown.close_failed", { name: closeError.name || "Error" });
      }
      await errorReporter.flush(2000);
      return "closed";
    });

    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeoutFn(() => resolve("timeout"), shutdownTimeoutMs);
    });
    shutdownPromise = Promise.race([shutdownPromise, timeoutPromise]).then((result) => {
      clearTimeoutFn(timeoutId);
      if (result === "timeout") {
        processRef.exitCode = 1;
        logger.error("process.shutdown.timed_out", { shutdownTimeoutMs });
      } else {
        logger.info("process.shutdown.completed", { source });
      }
      return result;
    });
    return shutdownPromise;
  }

  const handlers = {
    SIGTERM: () => { void beginShutdown({ source: "SIGTERM" }); },
    SIGINT: () => { void beginShutdown({ source: "SIGINT" }); },
    uncaughtException: (error) => {
      void beginShutdown({ source: "uncaughtException", error });
    },
    unhandledRejection: (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      void beginShutdown({ source: "unhandledRejection", error });
    }
  };

  Object.entries(handlers).forEach(([event, handler]) => processRef.on(event, handler));
  return () => {
    Object.entries(handlers).forEach(([event, handler]) => {
      processRef.removeListener(event, handler);
    });
  };
}

module.exports = {
  registerServerLifecycle
};
