const PERMISSIONS = Object.freeze({
  ANALYTICS_READ: "analytics.read",
  PRODUCTS_READ: "products.read",
  PRODUCTS_WRITE: "products.write",
  PRODUCTS_IMAGES_WRITE: "products.images.write",
  INVENTORY_READ: "inventory.read",
  INVENTORY_WRITE: "inventory.write",
  ORDERS_READ: "orders.read",
  ORDERS_STATUS_WRITE: "orders.status.write",
  ORDERS_SHIP: "orders.ship",
  ORDERS_CANCEL: "orders.cancel",
  ORDERS_REFUND: "orders.refund",
  RETURNS_READ: "returns.read",
  RETURNS_REVIEW: "returns.review",
  RETURNS_RECEIVE: "returns.receive",
  REVIEWS_READ: "reviews.read",
  REVIEWS_MODERATE: "reviews.moderate",
  REVIEWS_REPLY: "reviews.reply",
  SUPPORT_READ: "support.read",
  SUPPORT_ASSIGN: "support.assign",
  SUPPORT_REPLY: "support.reply",
  MARKETING_READ: "marketing.read",
  MARKETING_WRITE: "marketing.write",
  PAYMENTS_READ: "payments.read",
  PAYMENTS_CONFIGURE: "payments.configure",
  USERS_READ: "users.read",
  USERS_ROLES_MANAGE: "users.roles.manage",
  AUDIT_READ: "audit.read"
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));
const ROLE_PERMISSIONS = Object.freeze({
  super_admin: ALL_PERMISSIONS,
  operator: Object.freeze([
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.PRODUCTS_WRITE,
    PERMISSIONS.PRODUCTS_IMAGES_WRITE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_STATUS_WRITE,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_REFUND,
    PERMISSIONS.RETURNS_READ,
    PERMISSIONS.RETURNS_REVIEW,
    PERMISSIONS.MARKETING_READ,
    PERMISSIONS.MARKETING_WRITE,
    PERMISSIONS.PAYMENTS_READ
  ]),
  customer_service: Object.freeze([
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.RETURNS_READ,
    PERMISSIONS.REVIEWS_READ,
    PERMISSIONS.REVIEWS_MODERATE,
    PERMISSIONS.REVIEWS_REPLY,
    PERMISSIONS.SUPPORT_READ,
    PERMISSIONS.SUPPORT_ASSIGN,
    PERMISSIONS.SUPPORT_REPLY
  ]),
  warehouse: Object.freeze([
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_SHIP,
    PERMISSIONS.RETURNS_READ,
    PERMISSIONS.RETURNS_RECEIVE
  ]),
  customer: Object.freeze([])
});

function getPermissionsForRoles(roles = []) {
  const knownPermissions = new Set(ALL_PERMISSIONS);
  const permissions = new Set();

  (Array.isArray(roles) ? roles : []).forEach((role) => {
    (ROLE_PERMISSIONS[role] || []).forEach((permission) => {
      if (knownPermissions.has(permission)) {
        permissions.add(permission);
      }
    });
  });

  return [...permissions].sort();
}

function hasPermission(roles, permission) {
  if (!ALL_PERMISSIONS.includes(permission)) {
    return false;
  }
  return getPermissionsForRoles(roles).includes(permission);
}

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  getPermissionsForRoles,
  hasPermission
};
