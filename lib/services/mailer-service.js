const nodemailer = require("nodemailer");
const {
  enqueueEmail,
  findNextQueuedEmail,
  markEmailDeferred,
  markEmailFailed,
  markEmailSent
} = require("../repositories/email-outbox");

const MAX_DELIVERY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 120_000];

function renderEmail(email, from) {
  const token = String(email.payload.token || "");
  if (email.templateId === "email_verification") {
    return {
      from,
      to: email.recipient,
      subject: "Verify your Socks & Co. email",
      text: `Use this verification token: ${token}`
    };
  }
  if (email.templateId === "password_reset") {
    return {
      from,
      to: email.recipient,
      subject: "Reset your Socks & Co. password",
      text: `Use this password reset token: ${token}`
    };
  }
  throw new Error("EMAIL_TEMPLATE_INVALID");
}

function createMailerService({ config, withDatabase, transporter, now = () => new Date() }) {
  const isProduction = config.nodeEnv === "production";
  const smtpTransporter = transporter || (isProduction ? nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.password
    }
  }) : null);

  function enqueueTemplate(templateId, input) {
    return withDatabase((db) => enqueueEmail(db, {
      recipient: input.recipient,
      templateId,
      payload: {
        token: String(input.token || ""),
        locale: String(input.locale || "en"),
        expiresAt: input.expiresAt || null
      },
      now: now()
    }));
  }

  function enqueueVerificationEmail(input) {
    return enqueueTemplate("email_verification", input);
  }

  function enqueuePasswordResetEmail(input) {
    return enqueueTemplate("password_reset", input);
  }

  async function dispatchNext() {
    if (!isProduction) return null;
    const currentTime = now();
    const email = withDatabase((db) => findNextQueuedEmail(db, { now: currentTime }));
    if (!email) return null;

    try {
      await smtpTransporter.sendMail(renderEmail(email, config.smtp.from));
      return withDatabase((db) => markEmailSent(db, email.id, { now: currentTime }));
    } catch {
      const nextAttemptCount = email.attemptCount + 1;
      if (nextAttemptCount >= MAX_DELIVERY_ATTEMPTS) {
        return withDatabase((db) => markEmailFailed(db, email.id));
      }
      const retryAt = new Date(
        currentTime.getTime() + RETRY_DELAYS_MS[nextAttemptCount - 1]
      );
      return withDatabase((db) => markEmailDeferred(db, email.id, {
        nextAttemptAt: retryAt
      }));
    }
  }

  return {
    dispatchNext,
    enqueuePasswordResetEmail,
    enqueueVerificationEmail
  };
}

module.exports = {
  createMailerService
};
