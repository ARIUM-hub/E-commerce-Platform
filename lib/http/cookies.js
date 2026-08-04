function getCookieValue(request, cookieName) {
  const cookieHeader = request.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((entry) => entry.trim().split("="))
    .find(([name]) => name === cookieName)?.[1] || "";
}

function createCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  createCookie,
  getCookieValue
};
