const {
  consumeAccountToken,
  issueAccountToken
} = require("../repositories/account-tokens");
const { recordSecurityAudit } = require("../repositories/security-audit");
const {
  findUserById,
  markUserEmailVerified
} = require("../repositories/users");

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;

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

  return {
    confirmEmailVerification,
    requestEmailVerification
  };
}

module.exports = {
  createAccountSecurityService
};
