const { randomUUID } = require("node:crypto");

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

module.exports = {
  CAMPAIGN_TYPES,
  normalizeCampaignInput,
  createCampaignDraft,
  saveCampaignDraft,
  findCampaignById,
  listCampaigns,
  listCampaignVersions
};
