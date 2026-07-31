const crypto = require("node:crypto");
const {
  createItemizedRefund,
  createRefundForOrder,
  createRefundSummary
} = require("./refunds");
const { findFulfillmentByOrderId, syncFulfillmentForOrderStatus } = require("./fulfillment");
const { restockItems } = require("./inventory-movements");
const { findOrderById, saveOrder } = require("./orders");
const { updateReturnRequestStatus } = require("./returns");

function createValidationError(statusCode, code, message) {
  return { validationError: { statusCode, code, message } };
}

function normalizeForHash(value) {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = normalizeForHash(value[key]);
      return result;
    }, {});
  }
  return value;
}

function hashRequest(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(normalizeForHash(value)))
    .digest("hex");
}

function findAdminActionByOperationId(db, operationId) {
  const row = db.prepare(`
    SELECT * FROM admin_action_events WHERE operation_id = ?
  `).get(operationId);
  if (!row) return null;
  return {
    id: row.id,
    operationId: row.operation_id,
    adminUserId: row.admin_user_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    reason: row.reason,
    beforeStatus: row.before_status,
    afterStatus: row.after_status,
    ...JSON.parse(row.payload),
    createdAt: row.created_at
  };
}

function recordAdminAction(db, input) {
  const event = {
    id: `admin-action-${crypto.randomUUID()}`,
    operationId: input.operationId,
    adminUserId: input.admin?.id || null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    reason: input.reason,
    beforeStatus: input.beforeStatus,
    afterStatus: input.afterStatus,
    requestHash: input.requestHash,
    result: input.result,
    createdAt: new Date().toISOString()
  };
  db.prepare(`
    INSERT INTO admin_action_events (
      id, operation_id, admin_user_id, action, resource_type, resource_id,
      reason, before_status, after_status, payload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.operationId,
    event.adminUserId,
    event.action,
    event.resourceType,
    event.resourceId,
    event.reason,
    event.beforeStatus,
    event.afterStatus,
    JSON.stringify({ requestHash: event.requestHash, result: event.result }),
    event.createdAt
  );
  return event;
}

function listAdminActionsForResource(db, resourceType, resourceId) {
  return db.prepare(`
    SELECT operation_id FROM admin_action_events
    WHERE resource_type = ? AND resource_id = ?
    ORDER BY created_at DESC, rowid DESC
  `).all(resourceType, resourceId)
    .map((row) => findAdminActionByOperationId(db, row.operation_id));
}

function executeIdempotentAction(db, input) {
  const operationId = String(input.operationId || "").trim();
  if (!operationId) {
    return createValidationError(400, "ADMIN_ORDER_ACTION_INVALID", "Operation ID is required.");
  }

  const requestHash = hashRequest(input.requestPayload);
  const existing = findAdminActionByOperationId(db, operationId);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return createValidationError(
        409,
        "ADMIN_OPERATION_DUPLICATE_MISMATCH",
        "Operation ID was already used with different input."
      );
    }
    return { ...existing.result, replayed: true };
  }

  const transaction = db.transaction(() => {
    const result = input.run();
    if (result.validationError) return result;
    const afterStatus = result.order?.status || result.returnRequest?.status || input.beforeStatus;
    recordAdminAction(db, {
      operationId,
      admin: input.admin,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      reason: input.reason,
      beforeStatus: input.beforeStatus,
      afterStatus,
      requestHash,
      result
    });
    return { ...result, replayed: false };
  });

  return transaction();
}

function shipAdminOrder(db, {
  admin,
  order,
  body,
  confirmShipment,
  saveOrder,
  createTimelineEntry
}) {
  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: "ship",
    resourceType: "order",
    resourceId: order.id,
    reason: String(body.note || "confirmed_shipment").trim() || "confirmed_shipment",
    beforeStatus: order.status,
    requestPayload: body,
    run() {
      return confirmShipment(db, {
        order,
        carrier: body.carrier,
        trackingNumber: body.trackingNumber,
        locale: body.locale,
        saveOrder,
        createTimelineEntry
      });
    }
  });
}

function cancelAdminOrder(db, {
  admin,
  order,
  body,
  saveOrder,
  createTimelineEntry
}) {
  const reason = String(body.reason || "").trim();
  if (!reason) {
    return createValidationError(400, "ADMIN_ORDER_ACTION_INVALID", "Cancellation reason is required.");
  }
  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: "cancel",
    resourceType: "order",
    resourceId: order.id,
    reason,
    beforeStatus: order.status,
    requestPayload: body,
    run() {
      if (!["pending_payment", "paid", "processing"].includes(order.status)) {
        return createValidationError(
          409,
          "ADMIN_ORDER_CANCEL_NOT_ALLOWED",
          "Order can no longer be cancelled."
        );
      }
      const previousStatus = order.status;
      const nextStatus = previousStatus === "pending_payment" ? "cancelled" : "refund_pending";
      const now = new Date().toISOString();
      order.status = nextStatus;
      order.updatedAt = now;
      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      order.timeline.push(createTimelineEntry(nextStatus, body.locale));

      const fulfillment = findFulfillmentByOrderId(db, order.id);
      const fulfillmentResult = syncFulfillmentForOrderStatus(db, {
        order,
        fulfillment,
        orderStatus: nextStatus,
        locale: body.locale,
        createTimelineEntry
      });
      if (fulfillmentResult.validationError) return fulfillmentResult;
      order.fulfillment = fulfillmentResult.fulfillment
        ? {
            id: fulfillmentResult.fulfillment.id,
            status: fulfillmentResult.fulfillment.status,
            shippingMethodId: fulfillmentResult.fulfillment.shippingMethodId,
            shippingMethodLabel: fulfillmentResult.fulfillment.shippingMethodLabel,
            carrier: fulfillmentResult.fulfillment.carrier,
            trackingNumber: fulfillmentResult.fulfillment.trackingNumber,
            estimatedDeliveryDate: fulfillmentResult.fulfillment.estimatedDeliveryDate,
            estimatedDeliveryLabel: fulfillmentResult.fulfillment.estimatedDeliveryLabel,
            deliveryWindow: fulfillmentResult.fulfillment.deliveryWindow,
            addressZone: fulfillmentResult.fulfillment.addressZone
          }
        : order.fulfillment;

      const refund = previousStatus === "pending_payment"
        ? null
        : createRefundForOrder(db, order, {
            reason,
            locale: body.locale,
            operationId: body.operationId,
            refundType: "order_cancel"
          });
      if (refund) order.refund = createRefundSummary(refund);

      const restockResult = restockItems(db, {
        operationId: body.operationId,
        reason: "order_cancelled",
        sourceType: "order",
        sourceId: order.id,
        withinTransaction: true,
        items: (order.items || []).map((item) => ({
          productId: item.productId,
          skuId: item.skuId,
          quantity: item.quantity
        }))
      });
      if (restockResult.validationError) return restockResult;

      saveOrder(db, order);
      return {
        order,
        refund,
        movements: restockResult.movements
      };
    }
  });
}

function createAdminPartialRefund(db, { admin, order, body }) {
  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: "refund",
    resourceType: "order",
    resourceId: order.id,
    reason: String(body.reason || "").trim(),
    beforeStatus: order.status,
    requestPayload: body,
    run() {
      const result = createItemizedRefund(db, order, {
        operationId: body.operationId,
        reason: body.reason,
        items: body.items,
        note: body.note,
        refundType: "partial",
        locale: body.locale
      });
      if (result.validationError) return result;
      order.refund = createRefundSummary(result.refund);
      order.updatedAt = new Date().toISOString();
      saveOrder(db, order);
      return { order, refund: result.refund };
    }
  });
}

function validateReturnRefundItems(returnRequest, refundItems) {
  const requested = Array.isArray(refundItems) ? refundItems : [];
  const returnItemsBySku = new Map(
    (returnRequest.items || []).map((item) => [item.skuId, item])
  );
  for (const item of requested) {
    const returnItem = returnItemsBySku.get(String(item.skuId || "").trim());
    if (!returnItem || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) > returnItem.quantity) {
      return createValidationError(
        409,
        "ADMIN_REFUND_QUANTITY_EXCEEDED",
        "Refund quantity exceeds the return request quantity."
      );
    }
  }
  return null;
}

function reviewAdminReturnRequest(db, { admin, returnRequest, body }) {
  const action = String(body.action || "").trim();
  const nextStatusByAction = {
    start_review: "reviewing",
    approve: "approved",
    reject: "rejected",
    complete: "completed"
  };

  return executeIdempotentAction(db, {
    admin,
    operationId: body.operationId,
    action: `review_return_${action}`,
    resourceType: "return_request",
    resourceId: returnRequest.id,
    reason: String(body.reason || "").trim(),
    beforeStatus: returnRequest.status,
    requestPayload: body,
    run() {
      const nextStatus = nextStatusByAction[action];
      if (!nextStatus) {
        return createValidationError(
          400,
          "ADMIN_RETURN_ACTION_INVALID",
          "Return review action is invalid."
        );
      }
      if (action === "reject" && !String(body.reason || "").trim()) {
        return createValidationError(
          400,
          "ADMIN_RETURN_REASON_REQUIRED",
          "Return rejection reason is required."
        );
      }

      let refund = null;
      if (action === "approve" && ["return_refund", "refund_only"].includes(returnRequest.type)) {
        const itemValidation = validateReturnRefundItems(returnRequest, body.refundItems);
        if (itemValidation) return itemValidation;
        const order = findOrderById(db, returnRequest.orderId);
        if (!order) {
          return createValidationError(404, "ADMIN_ORDER_NOT_FOUND", "Order was not found.");
        }
        const refundResult = createItemizedRefund(db, order, {
          operationId: body.operationId,
          reason: body.reason,
          items: body.refundItems,
          note: body.note,
          refundType: returnRequest.type,
          returnRequestId: returnRequest.id,
          locale: body.locale
        });
        if (refundResult.validationError) return refundResult;
        refund = refundResult.refund;
        order.refund = createRefundSummary(refund);
        order.updatedAt = new Date().toISOString();
        saveOrder(db, order);
      }

      const statusResult = updateReturnRequestStatus(
        db,
        returnRequest,
        nextStatus,
        body.locale,
        { withinTransaction: true }
      );
      if (statusResult.validationError) return statusResult;

      let movements = [];
      if (action === "complete" && returnRequest.type === "return_refund") {
        const restockResult = restockItems(db, {
          operationId: body.operationId,
          reason: "return_refund_completed",
          sourceType: "return_request",
          sourceId: returnRequest.id,
          withinTransaction: true,
          items: (returnRequest.items || []).map((item) => ({
            productId: item.productId,
            skuId: item.skuId,
            quantity: item.quantity
          }))
        });
        if (restockResult.validationError) return restockResult;
        movements = restockResult.movements;
      }

      return {
        returnRequest: statusResult.returnRequest,
        refund,
        movements
      };
    }
  });
}

module.exports = {
  cancelAdminOrder,
  createAdminPartialRefund,
  executeIdempotentAction,
  findAdminActionByOperationId,
  listAdminActionsForResource,
  recordAdminAction,
  reviewAdminReturnRequest,
  shipAdminOrder
};
