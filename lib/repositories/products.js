function parseProductRow(row) {
  return JSON.parse(row.payload);
}

function applyVariantRows(product, variantRows) {
  const variants = variantRows.map((row) => ({
    skuId: row.sku_id,
    size: row.size,
    color: row.color,
    material: row.material,
    stockQuantity: row.stock_quantity,
    lowStockThreshold: row.low_stock_threshold,
    isAvailable: Boolean(row.is_available)
  }));

  return {
    ...product,
    variants,
    sizes: variants.map((variant) => variant.size)
  };
}

function listProducts(db) {
  const products = db.prepare("SELECT id, payload FROM products ORDER BY rowid ASC")
    .all()
    .map(parseProductRow);
  const variantRows = db.prepare("SELECT * FROM product_variants ORDER BY product_id ASC, rowid ASC").all();
  const variantsByProduct = variantRows.reduce((map, row) => {
    if (!map.has(row.product_id)) {
      map.set(row.product_id, []);
    }

    map.get(row.product_id).push(row);
    return map;
  }, new Map());

  return products.map((product) => applyVariantRows(product, variantsByProduct.get(product.id) || []));
}

function findProductById(db, productId) {
  return listProducts(db).find((product) => product.id === productId) || null;
}

module.exports = {
  listProducts,
  findProductById
};
