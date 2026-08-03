const crypto = require("node:crypto");
const { createCookie, getCookieValue } = require("../http/cookies");
const {
  createSession,
  deleteSession,
  findSession,
  findUserById
} = require("../repositories/users");

function createSessionService({ withDatabase, sessionCookieName, sessionMaxAgeSeconds }) {
  function createSessionId() {
    return crypto.randomBytes(24).toString("hex");
  }

  function createSessionCookie(sessionId) {
    return createCookie(sessionCookieName, sessionId, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: sessionMaxAgeSeconds
    });
  }

  function createExpiredSessionCookie() {
    return createCookie(sessionCookieName, "", {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 0
    });
  }

  async function getSessionContext(request) {
    const sessionId = getCookieValue(request, sessionCookieName);
    if (!sessionId) {
      return { session: null, user: null };
    }

    return withDatabase((db) => {
      const foundSession = findSession(db, sessionId);
      const now = Date.now();
      const isActiveSession = foundSession
        && (!foundSession.expiresAt || new Date(foundSession.expiresAt).getTime() > now);
      return {
        session: isActiveSession ? foundSession : null,
        user: isActiveSession && foundSession.userId ? findUserById(db, foundSession.userId) : null
      };
    });
  }

  async function createUserSession(userId) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionMaxAgeSeconds * 1000);
    const session = {
      id: createSessionId(),
      userId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    withDatabase((db) => createSession(db, session));
    return session;
  }

  async function removeSession(sessionId) {
    withDatabase((db) => deleteSession(db, sessionId));
  }

  return {
    getSessionContext,
    createUserSession,
    removeSession,
    createSessionId,
    createSessionCookie,
    createExpiredSessionCookie
  };
}

module.exports = {
  createSessionService
};
