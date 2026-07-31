const crypto = require("node:crypto");

const validLocales = new Set(["zh-CN", "en-US"]);
const validContactTopics = new Set(["orders", "returns", "delivery", "account", "product", "other"]);
const TICKET_STATUSES = new Set(["open", "in_progress", "waiting_customer", "resolved", "closed"]);
const TICKET_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

const trustCenterContent = {
  "zh-CN": {
    updatedAt: "2026-07-24T00:00:00.000Z",
    sections: [
      {
        id: "returns",
        title: "退换政策",
        eyebrow: "Returns",
        summary: "未穿着、未清洗且吊牌包装完整的袜子可在演示周期内申请退换。",
        bullets: ["保持商品卫生状态", "保留订单号或演示订单截图", "退款通常在审核后 3 个工作日内完成"]
      },
      {
        id: "delivery",
        title: "配送说明",
        eyebrow: "Delivery",
        summary: "标准配送与加急配送沿用结算页的预计送达逻辑。",
        bullets: ["标准配送默认包邮", "加急配送会在结算汇总中展示费用", "异常配送可通过联系入口提交工单"]
      },
      {
        id: "privacy",
        title: "隐私政策",
        eyebrow: "Privacy",
        summary: "本演示商城只保存完成购物流程所需的会话、购物车、地址和订单数据。",
        bullets: ["不会接入真实广告追踪", "不会向第三方发送联系表单", "清理测试数据库会移除演示数据"]
      },
      {
        id: "terms",
        title: "服务条款",
        eyebrow: "Terms",
        summary: "当前页面用于商城流程演示，价格、库存、优惠和订单状态均为演示数据。",
        bullets: ["下单不会产生真实支付", "库存扣减仅作用于本地演示数据库", "政策文案用于界面体验验证"]
      },
      {
        id: "faq",
        title: "FAQ",
        eyebrow: "Help",
        summary: "快速查看尺码、库存、优惠券、订单和账户相关问题。",
        bullets: ["默认展开第一个问题", "支持键盘切换", "需要人工说明时可提交联系工单"]
      },
      {
        id: "contact",
        title: "联系我们",
        eyebrow: "Contact",
        summary: "提交演示工单后，系统会返回一个可追踪的客服编号。",
        bullets: ["支持匿名用户提交", "登录用户会关联当前账户", "预计 1 个工作日内响应"]
      }
    ],
    faqs: [
      { id: "size-help", question: "如何选择袜子尺码？", answer: "建议先按详情页尺码按钮选择常穿鞋码，例如 39、40、41，再加入购物车。" },
      { id: "stock-limit", question: "为什么加购数量会受限制？", answer: "每个尺码都有独立库存，达到对应库存上限后系统会提示无货。" },
      { id: "coupon-use", question: "优惠券怎么使用？", answer: "在购物车抽屉输入有效券码，系统会由后端重新计算优惠与总价。" },
      { id: "order-history", question: "订单记录在哪里看？", answer: "登录后可以从顶部订单入口查看当前账户的演示订单历史。" },
      { id: "returns-window", question: "袜子可以退换吗？", answer: "演示规则要求商品未穿着、未清洗且包装完整，提交工单后进入退换流程。" }
    ],
    contactTopics: [
      { id: "orders", label: "订单问题" },
      { id: "returns", label: "退换问题" },
      { id: "delivery", label: "配送问题" },
      { id: "account", label: "账户问题" },
      { id: "product", label: "商品咨询" },
      { id: "other", label: "其他" }
    ]
  },
  "en-US": {
    updatedAt: "2026-07-24T00:00:00.000Z",
    sections: [
      {
        id: "returns",
        title: "Returns Policy",
        eyebrow: "Returns",
        summary: "Unworn, unwashed socks with intact packaging can be submitted for a demo return review.",
        bullets: ["Keep the item hygienic", "Keep the order number", "Refunds are simulated within 3 business days after review"]
      },
      {
        id: "delivery",
        title: "Delivery Notes",
        eyebrow: "Delivery",
        summary: "Standard and express delivery use the same estimated delivery logic as checkout.",
        bullets: ["Standard delivery is free in the demo", "Express delivery appears in checkout totals", "Delivery issues can be sent through the contact form"]
      },
      {
        id: "privacy",
        title: "Privacy Policy",
        eyebrow: "Privacy",
        summary: "This demo stores only the session, cart, address, and order data needed for the shopping flow.",
        bullets: ["No real ad tracking is connected", "Contact forms are not sent to third parties", "Resetting the test database removes demo data"]
      },
      {
        id: "terms",
        title: "Terms of Service",
        eyebrow: "Terms",
        summary: "This storefront is a demo; prices, stock, promotions, and order states are simulated.",
        bullets: ["No real payment is collected", "Stock changes only affect the local demo database", "Policy copy supports UI validation"]
      },
      {
        id: "faq",
        title: "FAQ",
        eyebrow: "Help",
        summary: "Find quick answers about sizing, stock, coupons, orders, and accounts.",
        bullets: ["The first question opens by default", "Keyboard toggling is supported", "Submit a ticket when more help is needed"]
      },
      {
        id: "contact",
        title: "Contact Us",
        eyebrow: "Contact",
        summary: "Submit a demo support request and receive a trackable ticket number.",
        bullets: ["Guest shoppers can submit", "Signed-in users are linked to their account", "Expected response is 1 business day"]
      }
    ],
    faqs: [
      { id: "size-help", question: "How do I choose a sock size?", answer: "Choose your usual shoe size on the detail page, such as 39, 40, or 41, before adding to cart." },
      { id: "stock-limit", question: "Why is add-to-cart quantity limited?", answer: "Each size has independent stock. When that stock is reached, the storefront shows an out-of-stock message." },
      { id: "coupon-use", question: "How do coupons work?", answer: "Enter a valid coupon in the cart drawer and backend pricing recalculates the savings and total." },
      { id: "order-history", question: "Where can I find order history?", answer: "After signing in, use the Orders link in the header to review demo order history." },
      { id: "returns-window", question: "Can socks be returned?", answer: "Demo rules require the item to be unworn, unwashed, and in intact packaging before return review." }
    ],
    contactTopics: [
      { id: "orders", label: "Order issue" },
      { id: "returns", label: "Return issue" },
      { id: "delivery", label: "Delivery issue" },
      { id: "account", label: "Account issue" },
      { id: "product", label: "Product question" },
      { id: "other", label: "Other" }
    ]
  }
};

function normalizeLocale(locale) {
  return validLocales.has(locale) ? locale : "zh-CN";
}

function normalizeContact(value) {
  return String(value || "").trim().toLowerCase();
}

function getTrustCenterContent(locale = "zh-CN") {
  return trustCenterContent[normalizeLocale(locale)];
}

function validateSupportTicketPayload(body) {
  const name = String(body.name || "").trim();
  const contact = String(body.contact || "").trim();
  const topic = String(body.topic || "").trim();
  const message = String(body.message || "").trim();

  if (!name) return { code: "SUPPORT_NAME_REQUIRED", message: "Name is required." };
  if (!contact) return { code: "SUPPORT_CONTACT_REQUIRED", message: "Contact is required." };
  if (!topic) return { code: "SUPPORT_TOPIC_REQUIRED", message: "Topic is required." };
  if (!validContactTopics.has(topic)) return { code: "SUPPORT_TOPIC_INVALID", message: "Support topic is invalid." };
  if (!message) return { code: "SUPPORT_MESSAGE_REQUIRED", message: "Message is required." };
  if (message.length > 1000) return { code: "SUPPORT_MESSAGE_TOO_LONG", message: "Message must be 1000 characters or fewer." };

  return null;
}

function buildSupportTicketNumber(db, now = new Date()) {
  const dateStamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  const row = db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE ticket_number LIKE ?").get(`SUP-${dateStamp}-%`);
  return `SUP-${dateStamp}-${String(row.count + 1).padStart(4, "0")}`;
}

function mapSupportTicketRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    sessionId: row.session_id || null,
    userId: row.user_id || null,
    name: row.name,
    contact: row.contact,
    topic: row.topic,
    orderId: row.order_id || "",
    message: row.message,
    locale: row.locale,
    status: row.status,
    priority: row.priority || "normal",
    assignedAdminUserId: row.assigned_admin_user_id || null,
    resolvedAt: row.resolved_at || null,
    closedAt: row.closed_at || null,
    lastMessageAt: row.last_message_at || row.created_at,
    version: Number(row.version || 1),
    parentTicketId: row.parent_ticket_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSupportMessageRow(row, audience) {
  const message = {
    id: row.id,
    ticketId: row.ticket_id,
    visibility: row.visibility,
    authorType: row.author_type,
    body: row.body,
    createdAt: row.created_at
  };
  if (audience === "admin") {
    message.authorUserId = row.author_user_id || null;
  }
  return message;
}

function listSupportTicketEvents(db, ticketId) {
  return db.prepare(`
    SELECT * FROM support_ticket_events
    WHERE ticket_id = ? ORDER BY created_at, rowid
  `).all(ticketId).map((row) => ({
    id: row.id,
    ticketId: row.ticket_id,
    eventType: row.event_type,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    actorType: row.actor_type,
    actorUserId: row.actor_user_id || null,
    reason: row.reason,
    createdAt: row.created_at
  }));
}

function stripInternalTicketFields(ticket) {
  const {
    assignedAdminUserId,
    sessionId,
    userId,
    ...publicTicket
  } = ticket;
  return publicTicket;
}

function findSupportTicketById(db, ticketId, options = {}) {
  const row = db.prepare("SELECT * FROM support_tickets WHERE id = ?").get(ticketId);
  if (!row) return null;
  const audience = options.audience === "admin" ? "admin" : "customer";
  const messageSql = audience === "admin"
    ? "SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at, rowid"
    : "SELECT * FROM support_ticket_messages WHERE ticket_id = ? AND visibility = 'public' ORDER BY created_at, rowid";
  const messages = db.prepare(messageSql).all(ticketId)
    .map((messageRow) => mapSupportMessageRow(messageRow, audience));
  const ticket = mapSupportTicketRow(row);
  return audience === "admin"
    ? { ...ticket, messages, events: listSupportTicketEvents(db, ticketId) }
    : { ...stripInternalTicketFields(ticket), messages };
}

function listSupportTicketsForUser(db, userId) {
  return db.prepare(`
    SELECT id FROM support_tickets
    WHERE user_id = ?
    ORDER BY datetime(COALESCE(last_message_at, created_at)) DESC, rowid DESC
  `).all(userId).map((row) => findSupportTicketById(db, row.id, { audience: "customer" }));
}

function findSupportTicketForGuest(db, ticketNumber, contact) {
  const row = db.prepare(`
    SELECT id FROM support_tickets
    WHERE ticket_number = ? AND lower(trim(contact)) = ?
    LIMIT 1
  `).get(String(ticketNumber || "").trim(), normalizeContact(contact));
  return row ? findSupportTicketById(db, row.id, { audience: "customer" }) : null;
}

function validateParentTicket(db, body, context) {
  const parentTicketId = String(body.parentTicketId || "").trim();
  if (!parentTicketId) return { parentTicketId: null };
  const parent = db.prepare("SELECT * FROM support_tickets WHERE id = ?").get(parentTicketId);
  const sameOwner = context.userId
    ? parent?.user_id === context.userId
    : Boolean(
        parent
        && context.authorizedParentTicketIds instanceof Set
        && context.authorizedParentTicketIds.has(parentTicketId)
        && normalizeContact(parent.contact) === normalizeContact(body.contact)
      );
  if (!parent || parent.status !== "closed" || !sameOwner) {
    return {
      validationError: {
        code: "SUPPORT_PARENT_TICKET_INVALID",
        message: "The parent support ticket cannot be linked."
      }
    };
  }
  return { parentTicketId };
}

function createSupportTicket(db, body, context = {}) {
  const validationError = validateSupportTicketPayload(body);
  if (validationError) {
    return { validationError };
  }

  const parentResult = validateParentTicket(db, body, context);
  if (parentResult.validationError) {
    return parentResult;
  }

  const now = new Date().toISOString();
  const ticketNumber = buildSupportTicketNumber(db);
  const ticket = {
    id: `ticket-${crypto.randomUUID()}`,
    ticketNumber,
    sessionId: context.sessionId || null,
    userId: context.userId || null,
    name: String(body.name).trim(),
    contact: String(body.contact).trim(),
    topic: String(body.topic).trim(),
    orderId: String(body.orderId || "").trim(),
    message: String(body.message).trim(),
    locale: normalizeLocale(body.locale),
    status: "open",
    priority: "normal",
    assignedAdminUserId: null,
    resolvedAt: null,
    closedAt: null,
    lastMessageAt: now,
    version: 1,
    parentTicketId: parentResult.parentTicketId,
    createdAt: now,
    updatedAt: now
  };

  const insert = db.transaction(() => {
    db.prepare(`
      INSERT INTO support_tickets (
        id, ticket_number, session_id, user_id, name, contact, topic, order_id, message,
        locale, status, priority, assigned_admin_user_id, resolved_at, closed_at,
        last_message_at, version, parent_ticket_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ticket.id,
      ticket.ticketNumber,
      ticket.sessionId,
      ticket.userId,
      ticket.name,
      ticket.contact,
      ticket.topic,
      ticket.orderId,
      ticket.message,
      ticket.locale,
      ticket.status,
      ticket.priority,
      ticket.assignedAdminUserId,
      ticket.resolvedAt,
      ticket.closedAt,
      ticket.lastMessageAt,
      ticket.version,
      ticket.parentTicketId,
      ticket.createdAt,
      ticket.updatedAt
    );
    db.prepare(`
      INSERT INTO support_ticket_messages (
        id, ticket_id, visibility, author_type, author_user_id, body, created_at
      ) VALUES (?, ?, 'public', 'customer', ?, ?, ?)
    `).run(`support-message-${crypto.randomUUID()}`, ticket.id, ticket.userId, ticket.message, now);
    return findSupportTicketById(db, ticket.id, { audience: "customer" });
  });

  return { ticket: insert() };
}

function addCustomerTicketMessage(db, ticket, actor = {}, body) {
  const messageBody = String(body || "").trim();
  if (!messageBody || messageBody.length > 1000) {
    return {
      validationError: {
        code: "SUPPORT_MESSAGE_INVALID",
        message: "Message must contain 1 to 1000 characters."
      }
    };
  }
  if (!ticket || !["open", "in_progress", "waiting_customer", "resolved"].includes(ticket.status)) {
    return {
      validationError: {
        code: "SUPPORT_TICKET_REPLY_NOT_ALLOWED",
        message: "This support ticket cannot receive customer replies."
      }
    };
  }
  const update = db.transaction(() => {
    const current = db.prepare("SELECT * FROM support_tickets WHERE id = ?").get(ticket.id);
    if (!current || !["open", "in_progress", "waiting_customer", "resolved"].includes(current.status)) {
      return {
        validationError: {
          code: "SUPPORT_TICKET_REPLY_NOT_ALLOWED",
          message: "This support ticket cannot receive customer replies."
        }
      };
    }
    const now = new Date().toISOString();
    const nextStatus = ["waiting_customer", "resolved"].includes(current.status)
      ? "in_progress"
      : current.status;
    db.prepare(`
      INSERT INTO support_ticket_messages (
        id, ticket_id, visibility, author_type, author_user_id, body, created_at
      ) VALUES (?, ?, 'public', 'customer', ?, ?, ?)
    `).run(`support-message-${crypto.randomUUID()}`, current.id, actor.userId || null, messageBody, now);
    if (nextStatus !== current.status) {
      db.prepare(`
        INSERT INTO support_ticket_events (
          id, ticket_id, event_type, before_value, after_value,
          actor_type, actor_user_id, reason, created_at
        ) VALUES (?, ?, 'customer_replied', ?, ?, 'customer', ?, 'customer_reply', ?)
      `).run(
        `support-event-${crypto.randomUUID()}`,
        current.id,
        current.status,
        nextStatus,
        actor.userId || null,
        now
      );
    }
    db.prepare(`
      UPDATE support_tickets
      SET status = ?, last_message_at = ?, updated_at = ?, version = version + 1,
        resolved_at = CASE WHEN ? = 'in_progress' THEN NULL ELSE resolved_at END
      WHERE id = ?
    `).run(nextStatus, now, now, nextStatus, current.id);
    return { ticket: findSupportTicketById(db, current.id, { audience: "customer" }) };
  });
  return update();
}

module.exports = {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  addCustomerTicketMessage,
  createSupportTicket,
  findSupportTicketById,
  findSupportTicketForGuest,
  getTrustCenterContent,
  listSupportTicketsForUser,
  listSupportTicketEvents,
  mapSupportTicketRow,
  normalizeContact,
  validateSupportTicketPayload
};
