const defaultSecurityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'"
};

function getSecurityHeaders(enabled = true) {
  return enabled ? { ...defaultSecurityHeaders } : {};
}

function mergeHeaders(...headerGroups) {
  return Object.assign({}, ...headerGroups.filter(Boolean));
}

module.exports = {
  getSecurityHeaders,
  mergeHeaders
};
