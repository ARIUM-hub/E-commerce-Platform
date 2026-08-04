const crypto = require("node:crypto");

function verifyWebhookSignature({ rawBody, signature, secret }) {
  const supplied = String(signature || "").trim().replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = crypto.createHmac("sha256", String(secret || ""))
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || ""))
    .digest("hex");
  const suppliedBuffer = Buffer.from(supplied.toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return suppliedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

module.exports = {
  verifyWebhookSignature
};
