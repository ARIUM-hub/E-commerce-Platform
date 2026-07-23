const errorDefinitions = {
  AUTH_REQUIRED: [401, "Authentication is required."],
  AUTH_VALIDATION_FAILED: [400, "Authentication information is incomplete."],
  INVALID_CREDENTIALS: [401, "Email or password is incorrect."],
  EMAIL_ALREADY_REGISTERED: [409, "Email is already registered."],
  SESSION_EXPIRED: [401, "Session has expired."],
  INVALID_JSON: [400, "Request body must be valid JSON."],
  VALIDATION_FAILED: [400, "Request validation failed."],
  INVALID_QUANTITY: [400, "Quantity must be a positive integer."],
  INVALID_SIZE: [400, "Size is not available for this product."],
  INVALID_SHIPPING_METHOD: [400, "Shipping method is invalid."],
  CHECKOUT_VALIDATION_FAILED: [400, "Checkout information is incomplete."],
  OUT_OF_STOCK: [409, "Selected size is out of stock."],
  INSUFFICIENT_STOCK: [409, "Selected size stock is not enough for the requested quantity."],
  CART_ITEM_NOT_FOUND: [404, "Cart item was not found."],
  EMPTY_CART: [400, "Cart is empty."],
  ADDRESS_NOT_FOUND: [404, "Address was not found."],
  ADDRESS_VALIDATION_FAILED: [400, "Address information is incomplete."],
  ORDER_NOT_FOUND: [404, "Order was not found."],
  INVALID_ORDER_STATUS: [400, "Order status is invalid."],
  INVALID_ORDER_TRANSITION: [409, "Order status transition is not allowed."],
  DATABASE_CONFLICT: [409, "Database conflict."],
  DATABASE_UNAVAILABLE: [503, "Database is unavailable."],
  INTERNAL_ERROR: [500, "Unexpected server error."]
};

function createApiError(code, overrides = {}) {
  const [defaultStatusCode, defaultMessage] = errorDefinitions[code] || errorDefinitions.INTERNAL_ERROR;
  return {
    statusCode: overrides.statusCode || defaultStatusCode,
    payload: {
      ok: false,
      error: {
        code,
        message: overrides.message || defaultMessage,
        details: overrides.details || {}
      }
    }
  };
}

module.exports = {
  createApiError,
  errorDefinitions
};
