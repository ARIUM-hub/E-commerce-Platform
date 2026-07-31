const { randomUUID } = require("node:crypto");
const { findProductById } = require("./products");

const CAMPAIGN_TYPES = new Set(["coupon", "promotion", "bundle"]);
const EDITABLE_STATUSES = new Set(["draft", "paused"]);

function normalizeCampaignInput(body = {}) {
  return {
    resourceType: String(body.resourceType || "").trim(),
    resourceKey: String(body.resourceKey || "").trim(),
    name: String(body.name || "").trim(),
    startsAt: String(body.startsAt || "").trim(),
    endsAt: String(body.endsAt || "").trim(),
    rules: body.rules && typeof body.rules === "object" && !Array.isArray(body.rules) ? body.rules : {}
  };
}

function createValidationError(fields, code = "MARKETING_CAMPAIGN_INVALID", statusCode = 400) {
  return {
    statusCode,
    code,
    message: code === "MARKETING_VERSION_CONFLICT"
      ? "The campaign was updated by another request."
      : "Campaign data is invalid.",
    fields
  };
}

function isValidIsoDate(value) {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function validateCampaignInput(db, input, campaignId = "") {
  const fields = [];
  if (!CAMPAIGN_TYPES.has(input.resourceType)) fields.push("resourceType");
  if (!input.resourceKey) fields.push("resourceKey");
  if (!input.name) fields.push("name");
  if (!isValidIsoDate(input.startsAt)) fields.push("startsAt");
  if (!isValidIsoDate(input.endsAt)) fields.push("endsAt");
  if (isValidIsoDate(input.startsAt) && isValidIsoDate(input.endsAt)
    && Date.parse(input.startsAt) >= Date.parse(input.endsAt)) {
    fields.push("endsAt");
  }

  if (input.resourceType && input.resourceKey) {
    const duplicate = db.prepare(`
      SELECT id FROM marketing_campaigns
      WHERE resource_type = ? AND resource_key = ? AND id <> ?
    `).get(input.resourceType, input.resourceKey, campaignId);
    if (duplicate) fields.push("resourceKey");
  }
  return fields.length ? createValidationError([...new Set(fields)]) : null;
}

function parseVersionPayload(value) {
  try {
    const payload = JSON.parse(value || "{}");
    return payload && typeof payload === "object" ? payload : {};
  } catch (_error) {
    return {};
  }
}

function mapCampaignRow(db, row) {
  if (!row) return null;
  const versionRow = db.prepare(`
    SELECT payload FROM marketing_campaign_versions
    WHERE campaign_id = ? AND version = ?
  `).get(row.id, row.current_version);
  const payload = parseVersionPayload(versionRow?.payload);
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceKey: row.resource_key,
    name: row.name,
    status: row.status,
    currentVersion: row.current_version,
    publishedVersion: row.published_version,
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    rules: payload.rules || {},
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function findCampaignById(db, campaignId) {
  return mapCampaignRow(
    db,
    db.prepare("SELECT * FROM marketing_campaigns WHERE id = ?").get(campaignId)
  );
}

function listCampaigns(db, filters = {}) {
  const clauses = [];
  const params = [];
  if (CAMPAIGN_TYPES.has(filters.resourceType)) {
    clauses.push("resource_type = ?");
    params.push(filters.resourceType);
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(String(filters.status));
  }
  if (String(filters.query || "").trim()) {
    clauses.push("(LOWER(name) LIKE ? OR LOWER(resource_key) LIKE ?)");
    const query = `%${String(filters.query).trim().toLowerCase()}%`;
    params.push(query, query);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`
    SELECT * FROM marketing_campaigns ${where}
    ORDER BY updated_at DESC, id ASC
  `).all(...params).map((row) => mapCampaignRow(db, row));
}

function listCampaignVersions(db, campaignId) {
  return db.prepare(`
    SELECT * FROM marketing_campaign_versions
    WHERE campaign_id = ? ORDER BY version DESC
  `).all(campaignId).map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    version: row.version,
    ...parseVersionPayload(row.payload),
    createdBy: row.created_by,
    createdAt: row.created_at
  }));
}

function createCampaignDraft(db, { admin = {}, body = {} } = {}) {
  const input = normalizeCampaignInput(body);
  const validationError = validateCampaignInput(db, input);
  if (validationError) return { validationError };

  const create = db.transaction(() => {
    const campaignId = `campaign-${randomUUID()}`;
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO marketing_campaigns (
        id, resource_type, resource_key, name, status, current_version, published_version,
        starts_at, ends_at, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'draft', 1, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      campaignId,
      input.resourceType,
      input.resourceKey,
      input.name,
      input.startsAt,
      input.endsAt,
      admin.id || null,
      admin.id || null,
      createdAt,
      createdAt
    );
    db.prepare(`
      INSERT INTO marketing_campaign_versions (id, campaign_id, version, payload, created_by, created_at)
      VALUES (?, ?, 1, ?, ?, ?)
    `).run(
      `${campaignId}-v1`,
      campaignId,
      JSON.stringify(input),
      admin.id || null,
      createdAt
    );
    return findCampaignById(db, campaignId);
  });
  return { campaign: create() };
}

function saveCampaignDraft(db, campaignId, { admin = {}, body = {} } = {}) {
  const save = db.transaction(() => {
    const current = findCampaignById(db, campaignId);
    if (!current) {
      return { validationError: createValidationError(["campaignId"], "MARKETING_CAMPAIGN_NOT_FOUND", 404) };
    }
    if (!EDITABLE_STATUSES.has(current.status)) {
      return { validationError: createValidationError(["status"], "MARKETING_CAMPAIGN_NOT_EDITABLE", 409) };
    }
    if (Number(body.expectedVersion) !== current.currentVersion) {
      return {
        validationError: createValidationError(["expectedVersion"], "MARKETING_VERSION_CONFLICT", 409),
        campaign: current
      };
    }

    const input = normalizeCampaignInput({
      resourceType: Object.hasOwn(body, "resourceType") ? body.resourceType : current.resourceType,
      resourceKey: Object.hasOwn(body, "resourceKey") ? body.resourceKey : current.resourceKey,
      name: Object.hasOwn(body, "name") ? body.name : current.name,
      startsAt: Object.hasOwn(body, "startsAt") ? body.startsAt : current.startsAt,
      endsAt: Object.hasOwn(body, "endsAt") ? body.endsAt : current.endsAt,
      rules: Object.hasOwn(body, "rules") ? body.rules : current.rules
    });
    const validationError = validateCampaignInput(db, input, campaignId);
    if (validationError) return { validationError };

    const nextVersion = current.currentVersion + 1;
    const updatedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO marketing_campaign_versions (id, campaign_id, version, payload, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `${campaignId}-v${nextVersion}`,
      campaignId,
      nextVersion,
      JSON.stringify(input),
      admin.id || null,
      updatedAt
    );
    db.prepare(`
      UPDATE marketing_campaigns
      SET resource_type = ?, resource_key = ?, name = ?, current_version = ?,
          starts_at = ?, ends_at = ?, updated_by = ?, updated_at = ?
      WHERE id = ? AND current_version = ?
    `).run(
      input.resourceType,
      input.resourceKey,
      input.name,
      nextVersion,
      input.startsAt,
      input.endsAt,
      admin.id || null,
      updatedAt,
      campaignId,
      current.currentVersion
    );
    return { campaign: findCampaignById(db, campaignId) };
  });
  return save();
}

function addField(fields, condition, field) {
  if (condition) fields.push(field);
}

function validateCouponRules(rules, fields) {
  const minimumSubtotal = Number(rules.minimumSubtotal);
  if (rules.type === "free-shipping") {
    addField(fields, !Number.isFinite(minimumSubtotal) || minimumSubtotal < 0, "rules.minimumSubtotal");
    return;
  }
  addField(fields, rules.type !== "amount-off", "rules.type");
  const discountAmount = Number(rules.discountAmount);
  addField(
    fields,
    !Number.isFinite(discountAmount) || discountAmount <= 0 || discountAmount >= minimumSubtotal,
    "rules.discountAmount"
  );
  addField(fields, !Number.isFinite(minimumSubtotal) || minimumSubtotal <= 0, "rules.minimumSubtotal");
}

function validatePromotionRules(db, rules, fields) {
  if (rules.kind === "threshold") {
    const threshold = Number(rules.threshold);
    const discountAmount = Number(rules.discountAmount);
    addField(fields, !Number.isFinite(threshold) || threshold <= 0, "rules.threshold");
    addField(
      fields,
      !Number.isFinite(discountAmount) || discountAmount <= 0 || discountAmount >= threshold,
      "rules.discountAmount"
    );
    return;
  }
  if (rules.kind !== "limited-time-product") {
    fields.push("rules.kind");
    return;
  }
  const product = findProductById(db, String(rules.productId || ""));
  addField(fields, !product, "rules.productId");
  if (product) {
    const promotionalPrice = Number(rules.promotionalPrice);
    addField(
      fields,
      !Number.isFinite(promotionalPrice) || promotionalPrice <= 0 || promotionalPrice >= Number(product.price),
      "rules.promotionalPrice"
    );
  }
}

function validateBundleRules(db, rules, fields) {
  const productIds = Array.isArray(rules.productIds) ? [...new Set(rules.productIds.map(String))] : [];
  addField(fields, productIds.length < 2, "rules.productIds");
  const products = productIds.map((productId) => findProductById(db, productId));
  addField(fields, products.some((product) => !product), "rules.productIds");
  products.forEach((product, index) => {
    if (!product) return;
    const productId = productIds[index];
    const defaultSize = String(rules.defaultSizes?.[productId] || "");
    const variant = product.variants.find((item) => item.size === defaultSize && item.isAvailable);
    addField(fields, !variant, `rules.defaultSizes.${productId}`);
  });
  if (products.every(Boolean)) {
    const itemTotal = products.reduce((total, product) => total + Number(product.price || 0), 0);
    const discountAmount = Number(rules.discountAmount);
    addField(
      fields,
      !Number.isFinite(discountAmount) || discountAmount <= 0 || discountAmount >= itemTotal,
      "rules.discountAmount"
    );
  }
}

function windowsOverlap(first, second) {
  return Date.parse(first.startsAt) < Date.parse(second.endsAt)
    && Date.parse(second.startsAt) < Date.parse(first.endsAt);
}

function promotionScope(campaign) {
  if (campaign.rules.kind === "threshold") return "threshold:all-products";
  if (campaign.rules.kind === "limited-time-product") {
    return `limited-time-product:${campaign.rules.productId}`;
  }
  return "";
}

function bundleScope(campaign) {
  return Array.isArray(campaign.rules.productIds)
    ? [...new Set(campaign.rules.productIds.map(String))].sort().join("|")
    : "";
}

function findCampaignConflicts(db, campaign) {
  if (campaign.resourceType === "coupon") return [];
  const scope = campaign.resourceType === "promotion"
    ? promotionScope(campaign)
    : bundleScope(campaign);
  if (!scope) return [];
  return listCampaigns(db)
    .filter((existing) => existing.id !== campaign.id)
    .filter((existing) => existing.resourceType === campaign.resourceType)
    .filter((existing) => existing.publishedVersion !== null && existing.status !== "ended")
    .filter((existing) => windowsOverlap(campaign, existing))
    .filter((existing) => {
      const existingScope = campaign.resourceType === "promotion"
        ? promotionScope(existing)
        : bundleScope(existing);
      return existingScope === scope;
    })
    .map((existing) => ({
      id: existing.id,
      resourceType: existing.resourceType,
      resourceKey: existing.resourceKey,
      name: existing.name,
      status: existing.status,
      startsAt: existing.startsAt,
      endsAt: existing.endsAt
    }));
}

function validateCampaignForPublish(db, campaign = {}) {
  const normalized = { id: campaign.id || "", ...normalizeCampaignInput(campaign) };
  const fields = validateCampaignInput(db, normalized, normalized.id)?.fields || [];
  if (normalized.resourceType === "coupon") validateCouponRules(normalized.rules, fields);
  if (normalized.resourceType === "promotion") validatePromotionRules(db, normalized.rules, fields);
  if (normalized.resourceType === "bundle") validateBundleRules(db, normalized.rules, fields);
  if (fields.length) {
    return { validationError: createValidationError([...new Set(fields)]) };
  }

  const conflicts = findCampaignConflicts(db, normalized);
  if (conflicts.length) {
    return {
      validationError: {
        ...createValidationError([], "MARKETING_CAMPAIGN_CONFLICT", 409),
        message: "Campaign schedule conflicts with an existing campaign.",
        conflicts
      }
    };
  }
  return { campaign: normalized, conflicts: [] };
}

module.exports = {
  CAMPAIGN_TYPES,
  normalizeCampaignInput,
  createCampaignDraft,
  saveCampaignDraft,
  findCampaignById,
  listCampaigns,
  listCampaignVersions,
  validateCampaignForPublish,
  findCampaignConflicts,
  windowsOverlap
};
