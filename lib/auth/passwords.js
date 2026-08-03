const crypto = require("node:crypto");

function createPasswordSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPassword(password, salt) {
  const hash = crypto.createHash("sha256");
  hash.update(`${salt}:${password}`);
  return `sha256:${hash.digest("hex")}`;
}

function verifyPassword(password, user) {
  return hashPassword(password, user.passwordSalt) === user.passwordHash;
}

module.exports = {
  createPasswordSalt,
  hashPassword,
  verifyPassword
};
