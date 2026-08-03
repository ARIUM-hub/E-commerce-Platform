const crypto = require("node:crypto");
const { createCookie } = require("../http/cookies");

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(String(first || ""));
  const secondBuffer = Buffer.from(String(second || ""));
  return firstBuffer.length === secondBuffer.length
    && crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function createCsrfService({
  secret,
  ttlMs = 2 * 60 * 60 * 1000,
  now = () => new Date(),
  randomBytes = crypto.randomBytes,
  isProduction = false
}) {
  const signingSecret = String(secret || "");
  if (!signingSecret) {
    throw new Error("CSRF_SECRET_REQUIRED");
  }

  function sign(payload) {
    return crypto.createHmac("sha256", signingSecret).update(payload).digest("hex");
  }

  function issueToken() {
    const issuedAt = now().getTime();
    const nonce = randomBytes(24).toString("base64url");
    const payload = `${nonce}.${issuedAt}`;
    return {
      token: `${payload}.${sign(payload)}`,
      expiresAt: new Date(issuedAt + ttlMs).toISOString()
    };
  }

  function verifyToken({ cookieToken, headerToken }) {
    if (!safeEqual(cookieToken, headerToken)) return false;
    const parts = String(headerToken || "").split(".");
    if (parts.length !== 3 || !parts[0] || !/^\d+$/.test(parts[1])) return false;
    const issuedAt = Number(parts[1]);
    const currentTime = now().getTime();
    if (!Number.isSafeInteger(issuedAt) || issuedAt > currentTime || currentTime - issuedAt > ttlMs) {
      return false;
    }
    const payload = `${parts[0]}.${parts[1]}`;
    return safeEqual(parts[2], sign(payload));
  }

  function createCsrfCookie(token) {
    return createCookie("socks_csrf", token, {
      httpOnly: false,
      path: "/",
      maxAge: Math.floor(ttlMs / 1000),
      sameSite: "Strict",
      secure: isProduction
    });
  }

  return {
    createCsrfCookie,
    issueToken,
    verifyToken
  };
}

module.exports = {
  createCsrfService
};
