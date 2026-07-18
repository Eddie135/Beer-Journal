import { initializeDatabase, withTransaction } from "./database.js";

const now = () => new Date().toISOString();
const uuid = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
  const random = Math.random() * 16 | 0;
  const value = char === "x" ? random : (random & 0x3) | 0x8;
  return value.toString(16);
});

export function normalizeTagName(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function splitTagInput(value) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[\n,，、;]/);
  const seen = new Set();
  return values.map((item) => String(item ?? "").normalize("NFKC").trim().replace(/\s+/g, " "))
    .filter((name) => {
      const normalized = normalizeTagName(name);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export const normalizeTagNames = splitTagInput;

const TAG_FIELDS = [
  "id", "remote_id", "owner_id", "name", "normalized_name", "category",
  "created_at", "updated_at", "deleted_at", "sync_status", "revision",
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tagColumns(alias = "ft") {
  return TAG_FIELDS.map((field) => `${alias}.${field} AS ${field}`).join(", ");
}

function tagFailure(details, code = "TAG_ID_INVALID") {
  const error = new Error("标签保存失败，请重试。");
  error.code = code;
  error.details = details;
  console.error("Beer Journal tag save failed", { details });
  return error;
}

export function assertValidTag(tag, method = "assertValidTag") {
  const fields = tag && typeof tag === "object" ? Object.keys(tag).sort().join(",") : "(none)";
  if (!tag || typeof tag !== "object") {
    throw tagFailure(`${method} returned a non-object Tag; fields=${fields}`, "TAG_CONTRACT_INVALID");
  }
  if (typeof tag.id !== "string" || !UUID_PATTERN.test(tag.id.trim())) {
    throw tagFailure(`${method} returned Tag without valid id; fields=${fields}`, "TAG_CONTRACT_INVALID");
  }
  if (typeof tag.name !== "string" || !tag.name.trim()) {
    throw tagFailure(`${method} returned Tag without name; fields=${fields}`, "TAG_CONTRACT_INVALID");
  }
  if (typeof tag.normalized_name !== "string" || !tag.normalized_name.trim()) {
    throw tagFailure(`${method} returned Tag without normalized_name; fields=${fields}`, "TAG_CONTRACT_INVALID");
  }
  return tag;
}

export function mapTagRow(row, method = "mapTagRow") {
  if (!row) return null;
  const tag = Object.fromEntries(TAG_FIELDS.map((field) => [field, row[field] ?? null]));
  if ("usage_count" in row) tag.usage_count = Number(row.usage_count || 0);
  return assertValidTag(tag, method);
}

function mapTagRelationRow(row, method = "mapTagRelationRow") {
  return {
    beer_id: row.beer_id,
    tag_id: row.tag_id,
    created_at: row.link_created_at ?? null,
    updated_at: row.link_updated_at ?? null,
    deleted_at: row.link_deleted_at ?? null,
    sync_status: row.link_sync_status ?? null,
    revision: Number(row.link_revision || 1),
    tag: mapTagRow(row, method),
  };
}

async function findTag(db, normalizedName) {
  const result = await db.query(`SELECT ${tagColumns()} FROM flavor_tags ft WHERE ft.normalized_name = ? LIMIT 1`, [normalizedName]);
  return mapTagRow(result.values?.[0], "findTag");
}

async function findTagById(db, id) {
  const result = await db.query(`SELECT ${tagColumns()} FROM flavor_tags ft WHERE ft.id = ? LIMIT 1`, [id]);
  return mapTagRow(result.values?.[0], "findTagById");
}

export async function createOrGetTagInTransaction(db, value) {
  const name = splitTagInput([value])[0];
  if (!name) throw new Error("标签不能为空");
  const normalizedName = normalizeTagName(name);
  const existing = await findTag(db, normalizedName);
  if (existing) {
    if (existing.deleted_at) {
      const timestamp = now();
      await db.run("UPDATE flavor_tags SET deleted_at = NULL, updated_at = ?, sync_status = 'pending_update', revision = revision + 1 WHERE id = ?", [timestamp, existing.id], false);
      return { ...existing, deleted_at: null, updated_at: timestamp, sync_status: "pending_update", revision: Number(existing.revision || 1) + 1 };
    }
    return existing;
  }
  const id = uuid();
  const timestamp = now();
  await db.run(`INSERT INTO flavor_tags (
    id, remote_id, owner_id, name, normalized_name, category, created_at, updated_at,
    deleted_at, sync_status, revision
  ) VALUES (?, NULL, NULL, ?, ?, 'custom', ?, ?, NULL, 'local', 1)`, [id, name, normalizedName, timestamp, timestamp], false);
  const inserted = await findTagById(db, id);
  if (!inserted?.id) {
    throw tagFailure(`Tag creation did not return a valid id for ${name}`);
  }
  return inserted;
}

export async function setBeerTagsInTransaction(db, beerId, values = []) {
  const names = splitTagInput(values);
  const desired = new Map();
  for (const name of names) desired.set(normalizeTagName(name), name);
  const currentResult = await db.query(`SELECT
    bft.beer_id AS beer_id,
    bft.tag_id AS tag_id,
    bft.created_at AS link_created_at,
    bft.updated_at AS link_updated_at,
    bft.deleted_at AS link_deleted_at,
    bft.sync_status AS link_sync_status,
    bft.revision AS link_revision,
    ${tagColumns()}
    FROM beer_flavor_tags bft JOIN flavor_tags ft ON ft.id = bft.tag_id
    WHERE bft.beer_id = ?`, [beerId]);
  const current = (currentResult.values || []).map((row) => mapTagRelationRow(row, "setBeerTagsInTransaction"));
  const currentByName = new Map(current.map((row) => [row.tag.normalized_name, row]));
  const timestamp = now();
  for (const [normalizedName, name] of desired) {
    const relation = currentByName.get(normalizedName);
    const tag = relation?.tag || await createOrGetTagInTransaction(db, name);
    assertValidTag(tag, "setBeerTagsInTransaction");
    const tagId = tag.id;
    const persisted = await findTagById(db, tagId);
    assertValidTag(persisted, "setBeerTagsInTransaction persisted tag");
    const existing = current.find((row) => row.tag_id === tagId);
    if (existing) {
      if (existing.deleted_at) {
        await db.run("UPDATE beer_flavor_tags SET deleted_at = NULL, updated_at = ?, sync_status = 'pending_update', revision = revision + 1 WHERE beer_id = ? AND tag_id = ?", [timestamp, beerId, tagId], false);
      }
    } else {
      await db.run(`INSERT INTO beer_flavor_tags
        (beer_id, tag_id, created_at, updated_at, deleted_at, sync_status, revision)
        VALUES (?, ?, ?, ?, NULL, 'local', 1)`, [beerId, tagId, timestamp, timestamp], false);
    }
  }
  for (const row of current) {
    if (!row.deleted_at && !desired.has(row.tag.normalized_name)) {
      await db.run("UPDATE beer_flavor_tags SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete', revision = revision + 1 WHERE beer_id = ? AND tag_id = ?", [timestamp, timestamp, beerId, row.tag_id], false);
    }
  }
}

export async function listTagsForBeers(db, beerIds) {
  if (!beerIds.length) return new Map();
  const placeholders = beerIds.map(() => "?").join(", ");
  const result = await db.query(`SELECT bft.beer_id AS beer_id, ${tagColumns()}
    FROM beer_flavor_tags bft
    JOIN flavor_tags ft ON ft.id = bft.tag_id
    WHERE bft.deleted_at IS NULL AND ft.deleted_at IS NULL AND bft.beer_id IN (${placeholders})
    ORDER BY ft.name COLLATE NOCASE`, beerIds);
  const grouped = new Map();
  for (const row of result.values || []) {
    if (!grouped.has(row.beer_id)) grouped.set(row.beer_id, []);
    grouped.get(row.beer_id).push(mapTagRow(row, "listTagsForBeers"));
  }
  return grouped;
}

export class TagRepository {
  async createOrGetTag(value) {
    return withTransaction((db) => createOrGetTagInTransaction(db, value));
  }

  async getTagById(id) {
    const { db } = await initializeDatabase();
    const result = await db.query(`SELECT ${tagColumns()} FROM flavor_tags ft WHERE ft.id = ? AND ft.deleted_at IS NULL LIMIT 1`, [id]);
    return mapTagRow(result.values?.[0], "getTagById");
  }

  async listTags() {
    const { db } = await initializeDatabase();
    const result = await db.query(`SELECT ${tagColumns()} FROM flavor_tags ft WHERE ft.deleted_at IS NULL ORDER BY ft.name COLLATE NOCASE`);
    return (result.values || []).map((row) => mapTagRow(row, "listTags"));
  }

  async searchTags(query = "") {
    const normalized = normalizeTagName(query);
    if (!normalized) return this.listTags();
    const { db } = await initializeDatabase();
    const pattern = `%${normalized}%`;
    const result = await db.query(`SELECT ${tagColumns()} FROM flavor_tags ft WHERE ft.deleted_at IS NULL AND (ft.name LIKE ? OR ft.normalized_name LIKE ?) ORDER BY ft.name COLLATE NOCASE`, [pattern, pattern]);
    return (result.values || []).map((row) => mapTagRow(row, "searchTags"));
  }

  async listTagsByBeerId(beerId) {
    const { db } = await initializeDatabase();
    const result = await db.query(`SELECT ${tagColumns()} FROM beer_flavor_tags bft JOIN flavor_tags ft ON ft.id = bft.tag_id
      WHERE bft.beer_id = ? AND bft.deleted_at IS NULL AND ft.deleted_at IS NULL ORDER BY ft.name COLLATE NOCASE`, [beerId]);
    return (result.values || []).map((row) => mapTagRow(row, "listTagsByBeerId"));
  }

  async setBeerTags(beerId, values) {
    await withTransaction((db) => setBeerTagsInTransaction(db, beerId, values));
    return this.listTagsByBeerId(beerId);
  }

  async addTagToBeer(beerId, value) {
    const tags = await this.listTagsByBeerId(beerId);
    return this.setBeerTags(beerId, [...tags.map((tag) => tag.name), value]);
  }

  async removeTagFromBeer(beerId, tagId) {
    const timestamp = now();
    await withTransaction((db) => db.run("UPDATE beer_flavor_tags SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete', revision = revision + 1 WHERE beer_id = ? AND tag_id = ? AND deleted_at IS NULL", [timestamp, timestamp, beerId, tagId], false));
    return this.listTagsByBeerId(beerId);
  }

  async listTagUsageCounts() {
    const { db } = await initializeDatabase();
    const result = await db.query(`SELECT ${tagColumns()}, COUNT(DISTINCT bft.beer_id) AS usage_count
      FROM flavor_tags ft LEFT JOIN beer_flavor_tags bft ON bft.tag_id = ft.id AND bft.deleted_at IS NULL
      LEFT JOIN beers b ON b.id = bft.beer_id AND b.deleted_at IS NULL
      WHERE ft.deleted_at IS NULL GROUP BY ft.id ORDER BY usage_count DESC, ft.name COLLATE NOCASE`);
    return (result.values || []).map((row) => mapTagRow(row, "listTagUsageCounts"));
  }

  async listAvailableFilterTags() { return this.listTagUsageCounts(); }
}

export const tagRepository = new TagRepository();
