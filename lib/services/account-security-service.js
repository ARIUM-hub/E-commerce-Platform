const {
  createRawToken,
  consumeAccountToken,
  hashToken,
  invalidateUserTokens,
  issueAccountToken
} = require("../repositories/account-tokens");
const { createPasswordSalt, hashPassword } = require("../auth/passwords");
const { recordSecurityAudit } = require("../repositories/security-audit");
const {
  deleteUserSessions,
  findUserByEmail,
  findUserById,
  markUserEmailVerified,
  updateUserPassword
} = require("../repositories/users");

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;
const PASSWORD_RESET_TTL_MS = 30 * 60_000;

function createAccountSecurityService({
  withDatabase,
  mailerService,
  auditRetentionDays = 180,
  hashIdentifier,
  now = () => new Date()
}) {
  function audit(db, input) {
    return recordSecurityAudit(db, {
      eventType: input.eventType,
      outcome: input.outcome,
      actorUserId: input.actorUserId || null,
      ipHash: input.ipHash || "",
      userAgentHash: input.userAgentHash || "",
      targetHash: input.targetValue
        ? hashIdentifier(input.targetValue, input.targetType || "account-security-target")
        : null,
      metadata: input.metadata,
      occurredAt: now(),
      retentionDays: auditRetentionDays
    });
  }

  function requestEmailVerification({ user, ipHash = "", userAgentHash = "" }) {
    if (user.emailVerifiedAt) {
      return { mailDelivery: "not_required", alreadyVerified: true };
    }
    const issued = withDatabase((db) => {
      const token = issueAccountToken(db, {
        type: "email_verification",
        userId: user.id,
        requestedIpHash: ipHash,
        now: now(),
        ttlMs: EMAIL_VERIFICATION_TTL_MS
      });
      audit(db, {
        eventType: "email_verification.requested",
        outcome: "success",
        actorUserId: user.id,
        ipHash,
        userAgentHash,
        targetValue: user.email,
        targetType: "email",
        metadata: { deliveryStatus: "queued" }
      });
      return token;
    });
    mailerService.enqueueVerificationEmail({
      recipient: user.email,
      token: issued.rawToken,
      expiresAt: issued.expiresAt
    });
    return { mailDelivery: "queued", expiresAt: issued.expiresAt };
  }

  function confirmEmailVerification({ token, ipHash = "", userAgentHash = "" }) {
    return withDatabase((db) => {
      const consumed = consumeAccountToken(db, {
        type: "email_verification",
        rawToken: token,
        now: now()
      });
      if (!consumed) {
        audit(db, {
          eventType: "email_verification.confirmed",
          outcome: "denied",
          ipHash,
          userAgentHash,
          targetValue: token,
          targetType: "email-verification-token",
          metadata: { reasonCode: "EMAIL_VERIFICATION_TOKEN_INVALID" }
        });
        return null;
      }
      const user = markUserEmailVerified(db, consumed.userId, now());
      audit(db, {
        eventType: "email_verification.confirmed",
        outcome: "success",
        actorUserId: user.id,
        ipHash,
        userAgentHash,
        targetValue: user.email,
        targetType: "email"
      });
      return findUserById(db, user.id);
    });
  }

  function requestPasswordReset({ email, ipHash = "", userAgentHash = "" }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const rawToken = createRawToken();
    hashToken(rawToken);
    const result = withDatabase((db) => {
      const user = findUserByEmail(db, normalizedEmail);
      let issued = null;
      if (user) {
        issued = issueAccountToken(db, {
          type: "password_reset",
          userId: user.id,
          rawToken,
          requestedIpHash: ipHash,
          now: now(),
          ttlMs: PASSWORD_RESET_TTL_MS
        });
      }
      audit(db, {
        eventType: "password_reset.requested",
        outcome: "accepted",
        actorUserId: user?.id || null,
        ipHash,
        userAgentHash,
        targetValue: normalizedEmail,
        targetType: "email",
        metadata: { deliveryStatus: user ? "queued" : "not_queued" }
      });
      return { user, issued };
    });
    if (result.user) {
      mailerService.enqueuePasswordResetEmail({
        recipient: result.user.email,
        token: result.issued.rawToken,
        expiresAt: result.issued.expiresAt
      });
    }
    return { accepted: true };
  }

  function confirmPasswordReset({ token, password, ipHash = "", userAgentHash = "" }) {
    return withDatabase((db) => {
      const consumed = consumeAccountToken(db, {
        type: "password_reset",
        rawToken: token,
        now: now()
      });
      if (!consumed) {
        audit(db, {
          eventType: "password_reset.confirmed",
          outcome: "denied",
          ipHash,
          userAgentHash,
          targetValue: token,
          targetType: "password-reset-token",
          metadata: { reasonCode: "PASSWORD_RESET_TOKEN_INVALID" }
        });
        return null;
      }
      const passwordSalt = createPasswordSalt();
      const user = updateUserPassword(db, consumed.userId, {
        passwordHash: hashPassword(password, passwordSalt),
        passwordSalt,
        changedAt: now()
      });
      invalidateUserTokens(db, {
        type: "password_reset",
        userId: user.id,
        consumedAt: now()
      });
      deleteUserSessions(db, user.id);
      audit(db, {
        eventType: "password_reset.confirmed",
        outcome: "success",
        actorUserId: user.id,
        ipHash,
        userAgentHash,
        targetValue: user.email,
        targetType: "email",
        metadata: { reasonCode: "PASSWORD_CHANGED" }
      });
      return user;
    });
  }

  return {
    confirmPasswordReset,
    confirmEmailVerification,
    requestPasswordReset,
    requestEmailVerification
  };
}

module.exports = {
  createAccountSecurityService
};
