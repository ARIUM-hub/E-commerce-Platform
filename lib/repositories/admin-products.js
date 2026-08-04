const VALID_CATEGORY_KEYS = new Set(["sport", "daily", "crew", "no-show"]);
const PRODUCT_ID_PATTERN = /^[a-z0-9-]+$/;

function parseProductRow(row) {
  return row ? JSON.parse(row.payload) : null;
}

function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : [];
}

function normalizeGallery(value) {
  return Array.isArray(value)
    ? value.map((item, index) => ({
      id: normalizeText(item.id, `img-${index + 1}`),
      src: normalizeText(item.src),
      alt: normalizeText(item.alt)
    })).filter((item) => item.src)
    : [];
}

function normalizeSizeChart(value) {
  return Array.isArray(value)
    ? value.map((item) => ({
      size: normalizeText(item.size),
      footLength: normalizeText(item.footLength),
      usMen: normalizeText(item.usMen),
      usWomen: normalizeText(item.usWomen)
    })).filter((item) => item.size)
    : [];
}

function normalizeVariant(productId, variant) {
  return {
    skuId: normalizeText(variant.skuId),
    productId,
    size: normalizeText(variant.size),
    color: normalizeText(variant.color),
    material: normalizeText(variant.material),
    stockQuantity: normalizeNumber(variant.stockQuantity),
    lowStockThreshold: normalizeNumber(variant.lowStockThreshold, 5),
    isAvailable: variant.isAvailable !== false
  };
}

function makeValidationError(code, message, statusCode = 400) {
  return { validationError: { statusCode, code, message } };
}

function normalizeProductForSave(input, existingId = "") {
  const product = input && typeof input === "object" ? input : {};
  const id = normalizeText(existingId || product.id);
  const categoryKey = normalizeText(product.categoryKey || product.category);
  const title = normalizeText(product.title);
  const categoryLabel = normalizeText(product.categoryLabel);
  const description = normalizeText(product.description);
  const localizedContent = product.localizedContent && typeof product.localizedContent === "object" ? product.localizedContent : {};
  const variants = Array.isArray(product.variants)
    ? product.variants.map((variant) => normalizeVariant(id, variant))
    : [];

  return {
    id,
    series: normalizeText(product.series),
    title,
    localizedContent: {
      ...localizedContent,
      "zh-CN": {
        ...(localizedContent["zh-CN"] || {}),
        title,
        categoryLabel,
        description
      }
    },
    categoryKey,
    categoryLabel,
    category: categoryKey,
    price: normalizeNumber(product.price),
    originalPrice: normalizeNumber(product.originalPrice, normalizeNumber(product.price)),
    discount: normalizeText(product.discount),
    description,
    isRecommended: normalizeBoolean(product.isRecommended),
    isTopRated: normalizeBoolean(product.isTopRated),
    isBestSeller: normalizeBoolean(product.isBestSeller),
    ratingValue: normalizeNumber(product.ratingValue),
    reviewCount: Math.max(0, Math.trunc(normalizeNumber(product.reviewCount))),
    releaseDate: normalizeText(product.releaseDate, new Date().toISOString().slice(0, 10)),
    recentlyBoughtLabel: normalizeText(product.recentlyBoughtLabel),
    shippingLabel: normalizeText(product.shippingLabel),
    deliveryEstimate: normalizeText(product.deliveryEstimate),
    visualTone: normalizeText(product.visualTone),
    visualShadow: normalizeText(product.visualShadow),
    visualAccent: normalizeText(product.visualAccent),
    visualPattern: normalizeText(product.visualPattern),
    colors: normalizeStringArray(product.colors),
    materials: normalizeStringArray(product.materials),
    sizeChart: normalizeSizeChart(product.sizeChart),
    gallery: normalizeGallery(product.gallery),
    variants,
    sizes: variants.map((variant) => variant.size)
  };
}

function validateProduct(product) {
  if (!product.id) return makeValidationError("ADMIN_PRODUCT_ID_REQUIRED", "Product ID is required.");
  if (!PRODUCT_ID_PATTERN.test(product.id)) return makeValidationError("ADMIN_PRODUCT_ID_INVALID", "Product ID is invalid.");
  if (!product.title) return makeValidationError("ADMIN_PRODUCT_TITLE_REQUIRED", "Product title is required.");
  if (!VALID_CATEGORY_KEYS.has(product.categoryKey)) return makeValidationError("ADMIN_PRODUCT_CATEGORY_INVALID", "Product category is invalid.");
  if (!Number.isFinite(product.price) || product.price < 0) return makeValidationError("ADMIN_PRODUCT_PRICE_INVALID", "Product price is invalid.");
  if (!Number.isFinite(product.originalPrice) || product.originalPrice < product.price) {
    return makeValidationError("ADMIN_PRODUCT_PRICE_INVALID", "Original price is invalid.");
  }
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    return makeValidationError("ADMIN_PRODUCT_VARIANTS_REQUIRED", "At least one SKU is required.");
  }

  const seenSkuIds = new Set();
  const seenSizes = new Set();
  for (const variant of product.variants) {
    if (!variant.skuId || !variant.size) {
      return makeValidationError("ADMIN_PRODUCT_VARIANT_INVALID", "SKU ID and size are required.");
    }
    if (seenSkuIds.has(variant.skuId) || seenSizes.has(variant.size)) {
      return makeValidationError("ADMIN_PRODUCT_VARIANT_INVALID", "SKU ID and size must be unique.");
    }
    if (!Number.isInteger(variant.stockQuantity) || variant.stockQuantity < 0 || variant.stockQuantity > 9999) {
      return makeValidationError("ADMIN_PRODUCT_VARIANT_INVALID", "SKU stock quantity is invalid.");
    }
    if (!Number.isInteger(variant.lowStockThreshold) || variant.lowStockThreshold < 0 || variant.lowStockThreshold > 999) {
      return makeValidationError("ADMIN_PRODUCT_VARIANT_INVALID", "SKU low stock threshold is invalid.");
    }
    seenSkuIds.add(variant.skuId);
    seenSizes.add(variant.size);
  }

  return { product };
}

function findAdminProductById(db, productId) {
  const row = db.prepare("SELECT payload FROM products WHERE id = ?").get(productId);
  if (!row) return null;
  const product = parseProductRow(row);
  const variantRows = db.prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY rowid ASC").all(productId);
  const variants = variantRows.map((variant) => ({
    skuId: variant.sku_id,
    productId: variant.product_id,
    size: variant.size,
    color: variant.color,
    material: variant.material,
    stockQuantity: variant.stock_quantity,
    lowStockThreshold: variant.low_stock_threshold,
    isAvailable: Boolean(variant.is_available)
  }));

  return { ...product, variants, sizes: variants.map((variant) => variant.size) };
}

function saveProductTransaction(db, product, mode) {
  const save = db.transaction(() => {
    if (mode === "create") {
      db.prepare("INSERT INTO products (id, payload) VALUES (?, ?)").run(product.id, JSON.stringify(product));
    } else {
      db.prepare("UPDATE products SET payload = ? WHERE id = ?").run(JSON.stringify(product), product.id);
      db.prepare("DELETE FROM product_variants WHERE product_id = ?").run(product.id);
    }

    const insertVariant = db.prepare(`
      INSERT INTO product_variants (
        sku_id, product_id, size, color, material, stock_quantity, low_stock_threshold, is_available
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    product.variants.forEach((variant) => {
      insertVariant.run(
        variant.skuId,
        product.id,
        variant.size,
        variant.color,
        variant.material,
        variant.stockQuantity,
        variant.lowStockThreshold,
        variant.isAvailable ? 1 : 0
      );
    });
  });

  save();
  return findAdminProductById(db, product.id);
}

function createAdminProduct(db, body) {
  const product = normalizeProductForSave(body.product);
  const validation = validateProduct(product);
  if (validation.validationError) return validation;

  const existing = db.prepare("SELECT id FROM products WHERE id = ?").get(product.id);
  if (existing) return makeValidationError("ADMIN_PRODUCT_DUPLICATE", "Product already exists.", 409);

  return { product: saveProductTransaction(db, product, "create") };
}

function updateAdminProduct(db, productId, body) {
  const existing = findAdminProductById(db, productId);
  if (!existing) return makeValidationError("ADMIN_PRODUCT_NOT_FOUND", "Product was not found.", 404);
  if (body.product?.id && body.product.id !== productId) {
    return makeValidationError("ADMIN_PRODUCT_ID_INVALID", "Product ID cannot be changed.");
  }

  const product = normalizeProductForSave({ ...existing, ...body.product, id: productId }, productId);
  const validation = validateProduct(product);
  if (validation.validationError) return validation;

  return { product: saveProductTransaction(db, product, "update") };
}

function parseSizeTemplate(input) {
  const sizes = new Set();
  String(input || "").split(",").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map((value) => Number(value.trim()));
      if (Number.isInteger(start) && Number.isInteger(end) && start <= end) {
        for (let size = start; size <= end; size += 1) sizes.add(String(size));
      }
      return;
    }
    sizes.add(part);
  });
  return [...sizes];
}

function generateSkuTemplate({ productId, template, stockQuantity = 10, lowStockThreshold = 5, color = "", material = "" }) {
  return parseSizeTemplate(template).map((size) => ({
    skuId: `${productId}-${size}`,
    productId,
    size,
    color,
    material,
    stockQuantity: Number(stockQuantity),
    lowStockThreshold: Number(lowStockThreshold),
    isAvailable: true
  }));
}

module.exports = {
  createAdminProduct,
  findAdminProductById,
  generateSkuTemplate,
  normalizeProductForSave,
  parseSizeTemplate,
  updateAdminProduct
};
