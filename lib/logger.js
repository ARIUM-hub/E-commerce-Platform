const levelRank = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};

function serializeContext(context) {
  if (!context || Object.keys(context).length === 0) {
    return "";
  }
  return ` ${JSON.stringify(context)}`;
}

function createLogger({ level = "info", sink = console.log, now = () => new Date() } = {}) {
  const minimumRank = levelRank[level] ?? levelRank.info;

  function write(entryLevel, event, context = {}) {
    if ((levelRank[entryLevel] ?? levelRank.info) < minimumRank) {
      return;
    }
    sink(`${now().toISOString()} [${entryLevel}] ${event}${serializeContext(context)}`);
  }

  return {
    debug: (event, context) => write("debug", event, context),
    info: (event, context) => write("info", event, context),
    warn: (event, context) => write("warn", event, context),
    error: (event, context) => write("error", event, context)
  };
}

module.exports = {
  createLogger
};
