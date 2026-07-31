const crypto = require("node:crypto");
const { executeIdempotentAction } = require("./admin-order-actions");
const {
  TICKET_PRIORITIES,
  findSupportTicketById
} = require("./support");

const SUPPORT_TRANSITIONS = {
  open: new Set(["in_progress", "closed"]),
  in_progress: new Set(["waiting_customer", "resolved", "closed"]),
  waiting_customer: new Set(["in_progress", "resolved", "closed"]),
  resolved: new Set(["in_progress", "closed"]),
  closed: new Set()
};

function validation(statusCode, code, message, extra = {}) {
  return { validationError: { statusCode, code, message, ...extra } };
}

function recordSupportEvent(db, values) {
  db.prepare(`
    INSERT INTO support_ticket_events (
      id, ticket_id, event_type, before_value, after_value,
      actor_type, actor_user_id, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?)
  `).run(
    `support-event-${crypto.randomUUID()}`,
    values.ticketId,
    values.eventType,
    String(values.beforeValue ?? ""),
    String(values.afterValue ?? ""),
    values.admin?.id || null,
    values.reason,
    values.createdAt
  );
}

function updateSupportTicket(db, { admin, ticketId, body = {} }) {
  const ticket = findSupportTicketById(db, ticketId, { audience: "admin" });
  if (!ticket) return validation(404, "SUPPORT_TICKET_NOT_FOUND", "Support ticket was not found.");
  const action = String(body.action || "").trim();
  if (!["assign", "priority", "status"].includes(action)) {
    return validation(400, "SUPPORT_ACTION_INVALID", "Support ticket action is invalid.");
  }

  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: `support_${action}`,
    resourceType: "support_ticket",
    resourceId: ticketId,
    reason: String(body.reason || action).trim(),
    beforeStatus: ticket.status,
    requestPayload: body,
    run() {
      const current = findSupportTicketById(db, ticketId, { audience: "admin" });
      if (!current) return validation(404, "SUPPORT_TICKET_NOT_FOUND", "Support ticket was not found.");
      if (!Number.isInteger(body.expectedVersion) || body.expectedVersion !== current.version) {
        return validation(409, "SUPPORT_VERSION_CONFLICT", "Support ticket was updated by another operation.", {
          currentVersion: current.version
        });
      }

      const now = new Date().toISOString();
      let beforeValue;
      let afterValue;
      let nextStatus = current.status;
      if (action === "assign") {
        beforeValue = current.assignedAdminUserId;
        afterValue = body.assignedAdminUserId || null;
        db.prepare(`
          UPDATE support_tickets
          SET assigned_admin_user_id = ?, updated_at = ?, version = version + 1
          WHERE id = ?
        `).run(afterValue, now, ticketId);
      } else if (action === "priority") {
        afterValue = String(body.priority || "").trim();
        if (!TICKET_PRIORITIES.has(afterValue)) {
          return validation(400, "SUPPORT_PRIORITY_INVALID", "Support ticket priority is invalid.");
        }
        beforeValue = current.priority;
        db.prepare(`
          UPDATE support_tickets
          SET priority = ?, updated_at = ?, version = version + 1
          WHERE id = ?
        `).run(afterValue, now, ticketId);
      } else {
        afterValue = String(body.status || "").trim();
        if (!SUPPORT_TRANSITIONS[current.status]?.has(afterValue)) {
          return validation(409, "SUPPORT_STATUS_CONFLICT", "Support ticket status transition is not allowed.");
        }
        beforeValue = current.status;
        nextStatus = afterValue;
        const resolvedAt = afterValue === "resolved"
          ? now
          : afterValue === "in_progress"
            ? null
            : current.resolvedAt;
        const closedAt = afterValue === "closed" ? now : null;
        db.prepare(`
          UPDATE support_tickets
          SET status = ?, resolved_at = ?, closed_at = ?, updated_at = ?, version = version + 1
          WHERE id = ?
        `).run(afterValue, resolvedAt, closedAt, now, ticketId);
      }

      recordSupportEvent(db, {
        ticketId,
        eventType: action,
        beforeValue,
        afterValue,
        admin,
        reason: String(body.reason || action).trim(),
        createdAt: now
      });
      return {
        ticket: findSupportTicketById(db, ticketId, { audience: "admin" }),
        afterStatus: nextStatus
      };
    }
  });
}

function addAdminSupportMessage(db, { admin, ticketId, body = {} }) {
  const ticket = findSupportTicketById(db, ticketId, { audience: "admin" });
  if (!ticket) return validation(404, "SUPPORT_TICKET_NOT_FOUND", "Support ticket was not found.");
  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: "support_message",
    resourceType: "support_ticket",
    resourceId: ticketId,
    reason: String(body.visibility || "public") === "internal" ? "internal_note" : "public_reply",
    beforeStatus: ticket.status,
    requestPayload: body,
    run() {
      const current = findSupportTicketById(db, ticketId, { audience: "admin" });
      if (!current) return validation(404, "SUPPORT_TICKET_NOT_FOUND", "Support ticket was not found.");
      if (current.status === "closed") {
        return validation(409, "SUPPORT_TICKET_CLOSED", "Closed support tickets cannot receive messages.");
      }
      const visibility = String(body.visibility || "").trim();
      const message = String(body.message || "").trim();
      if (!["public", "internal"].includes(visibility)) {
        return validation(400, "SUPPORT_MESSAGE_VISIBILITY_INVALID", "Support message visibility is invalid.");
      }
      if (!message || message.length > 2000) {
        return validation(400, "SUPPORT_MESSAGE_INVALID", "Support message must contain 1 to 2000 characters.");
      }
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO support_ticket_messages (
          id, ticket_id, visibility, author_type, author_user_id, body, created_at
        ) VALUES (?, ?, ?, 'admin', ?, ?, ?)
      `).run(
        `support-message-${crypto.randomUUID()}`,
        ticketId,
        visibility,
        admin?.id || null,
        message,
        now
      );
      if (visibility === "public") {
        db.prepare(`
          UPDATE support_tickets
          SET last_message_at = ?, updated_at = ?, version = version + 1
          WHERE id = ?
        `).run(now, now, ticketId);
      } else {
        db.prepare(`
          UPDATE support_tickets SET updated_at = ?, version = version + 1 WHERE id = ?
        `).run(now, ticketId);
      }
      recordSupportEvent(db, {
        ticketId,
        eventType: visibility === "public" ? "public_reply" : "internal_note",
        beforeValue: current.status,
        afterValue: current.status,
        admin,
        reason: visibility,
        createdAt: now
      });
      return {
        ticket: findSupportTicketById(db, ticketId, { audience: "admin" }),
        afterStatus: current.status
      };
    }
  });
}

module.exports = {
  SUPPORT_TRANSITIONS,
  addAdminSupportMessage,
  updateSupportTicket
};
