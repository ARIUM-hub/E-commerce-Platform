function createSupportLookupLimiter(options = {}) {
  const maxFailures = options.maxFailures || 5;
  const cooldownMs = options.cooldownMs || 15 * 60 * 1000;
  const now = options.now || Date.now;
  const failures = new Map();
  const authorizations = new Map();

  function getActiveFailure(key) {
    const entry = failures.get(key);
    if (!entry || now() - entry.firstFailureAt > cooldownMs) {
      failures.delete(key);
      return null;
    }
    return entry;
  }

  function getActiveAuthorization(key) {
    const entry = authorizations.get(key);
    if (!entry || entry.expiresAt <= now()) {
      authorizations.delete(key);
      return null;
    }
    return entry;
  }

  return {
    canAttempt(key) {
      const entry = getActiveFailure(key);
      return !entry || entry.count < maxFailures;
    },

    retryAfterMs(key) {
      const entry = getActiveFailure(key);
      if (!entry || entry.count < maxFailures) return 0;
      return Math.max(0, cooldownMs - (now() - entry.firstFailureAt));
    },

    recordFailure(key) {
      const entry = getActiveFailure(key) || { count: 0, firstFailureAt: now() };
      entry.count += 1;
      failures.set(key, entry);
    },

    recordSuccess(key) {
      failures.delete(key);
    },

    authorizeTicket(key, ticketId) {
      const entry = authorizations.get(key) || {
        expiresAt: now() + cooldownMs,
        ticketIds: new Set()
      };
      entry.expiresAt = now() + cooldownMs;
      entry.ticketIds.add(ticketId);
      authorizations.set(key, entry);
    },

    canAccessTicket(key, ticketId) {
      return Boolean(getActiveAuthorization(key)?.ticketIds.has(ticketId));
    },

    getAuthorizedTicketIds(key) {
      return new Set(getActiveAuthorization(key)?.ticketIds || []);
    }
  };
}

module.exports = { createSupportLookupLimiter };
