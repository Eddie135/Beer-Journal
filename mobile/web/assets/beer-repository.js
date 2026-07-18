import { initializeDatabase, withTransaction } from "./database.js";
import { listTagsForBeers, normalizeTagNames, setBeerTagsInTransaction } from "./tag-repository.js";

const now = () => new Date().toISOString();
const uuid = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
  const random = Math.random() * 16 | 0;
  const value = char === "x" ? random : (random & 0x3) | 0x8;
  return value.toString(16);
});
const text = (value) => String(value ?? "").trim();
const scaled = (value, factor) => {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("数值格式不正确");
  return Math.round(number * factor);
};
const rating = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 5) throw new Error("体验评分必须为 1 到 5 星");
  return number;
};

function normalizeInput(input) {
  const name = text(input.name);
  if (!name) throw new Error("啤酒名称不能为空");
  return {
    name,
    brand: text(input.brand),
    brewery: text(input.brewery),
    country_code: text(input.country_code).toUpperCase(),
    country_name: text(input.country_name),
    category: text(input.category),
    style: text(input.style),
    abv_scaled: scaled(input.abv, 100),
    plato_scaled: scaled(input.plato, 100),
    default_volume_ml: input.default_volume_ml === "" ? null : Number(input.default_volume_ml || 0) || null,
    personal_note: text(input.personal_note),
    overall_rating_scaled: scaled(input.overall_rating, 10),
    mouthfeel_rating: rating(input.mouthfeel_rating),
    bitterness_rating: rating(input.bitterness_rating),
    complexity_rating: rating(input.complexity_rating),
    flavor_tags: normalizeTagNames(input.flavor_tags ?? input.flavor_tag_names ?? input.tags ?? input.flavor_tag_input),
  };
}

function mapRow(row) {
  return {
    ...row,
    abv: row.abv_scaled === null ? "" : (row.abv_scaled / 100).toFixed(2).replace(/\.00$/, ""),
    plato: row.plato_scaled === null ? "" : (row.plato_scaled / 100).toFixed(2).replace(/\.00$/, ""),
    overall_rating: row.overall_rating_scaled === null ? "" : (row.overall_rating_scaled / 10).toFixed(1),
    average_rating: row.average_rating_scaled === null || row.average_rating_scaled === undefined ? "" : (Number(row.average_rating_scaled) / 10).toFixed(1),
  };
}

async function setBeerTagsSafely(db, beerId, values) {
  try {
    await setBeerTagsInTransaction(db, beerId, values);
  } catch (error) {
    console.error("Beer Journal tag relation write failed", error);
    if (error?.code === "TAG_ID_INVALID") throw error;
    const wrapped = new Error("标签保存失败，请重试。");
    wrapped.code = "TAG_SAVE_FAILED";
    wrapped.details = error?.message || String(error);
    throw wrapped;
  }
}

export class BeerRepository {
  async createBeer(input) {
    const values = normalizeInput(input);
    const id = uuid();
    const timestamp = now();
    await withTransaction(async (db) => {
      await db.run(`INSERT INTO beers (
      id, remote_id, owner_id, name, brand, brewery, country_code, country_name,
      style, category, abv_scaled, plato_scaled, default_volume_ml, personal_note,
      overall_rating_scaled, mouthfeel_rating, bitterness_rating, complexity_rating,
      created_at, updated_at, sync_status, revision
    ) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', 1)`, [
      id, values.name, values.brand, values.brewery, values.country_code, values.country_name,
      values.style, values.category, values.abv_scaled, values.plato_scaled, values.default_volume_ml,
      values.personal_note, values.overall_rating_scaled, values.mouthfeel_rating,
      values.bitterness_rating, values.complexity_rating, timestamp, timestamp,
      ], false);
      await setBeerTagsSafely(db, id, values.flavor_tags);
    });
    return this.getBeerById(id);
  }

  async getBeerById(id) {
    const { db } = await initializeDatabase();
    const result = await db.query("SELECT * FROM beers WHERE id = ? LIMIT 1", [id]);
    if (!result.values?.[0]) return null;
    const beer = mapRow(result.values[0]);
    const grouped = await listTagsForBeers(db, [beer.id]);
    beer.flavor_tags = grouped.get(beer.id) || [];
    return beer;
  }

  async listBeers(filters = {}) {
    const { db } = await initializeDatabase();
    const clauses = [filters.includeDeleted ? "1 = 1" : "deleted_at IS NULL"];
    const params = [];
    const query = text(filters.query);
    if (query) {
      clauses.push("(name LIKE ? OR brand LIKE ? OR brewery LIKE ? OR country_name LIKE ? OR style LIKE ? OR category LIKE ? OR EXISTS (SELECT 1 FROM beer_flavor_tags bft JOIN flavor_tags ft ON ft.id = bft.tag_id WHERE bft.beer_id = beers.id AND bft.deleted_at IS NULL AND ft.deleted_at IS NULL AND (ft.name LIKE ? OR ft.normalized_name LIKE ?)))");
      const pattern = `%${query}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
    if (filters.category) { clauses.push("category = ?"); params.push(filters.category); }
    if (filters.style) { clauses.push("style = ?"); params.push(filters.style); }
    if (filters.country_code) { clauses.push("country_code = ?"); params.push(filters.country_code); }
    else if (filters.country_name) { clauses.push("LOWER(country_name) = LOWER(?)"); params.push(text(filters.country_name)); }
    if (filters.min_rating !== "" && filters.min_rating !== undefined) { clauses.push("overall_rating_scaled >= ?"); params.push(Number(filters.min_rating) * 10); }
    if (filters.max_rating !== "" && filters.max_rating !== undefined) { clauses.push("overall_rating_scaled <= ?"); params.push(Number(filters.max_rating) * 10); }
    if (filters.mouthfeel_rating !== "" && filters.mouthfeel_rating !== undefined) { clauses.push("mouthfeel_rating = ?"); params.push(Number(filters.mouthfeel_rating)); }
    if (filters.has_photo === true || filters.has_photo === "true") { clauses.push("EXISTS (SELECT 1 FROM photos p WHERE p.beer_id = beers.id AND p.deleted_at IS NULL)"); }
    if (filters.has_photo === false || filters.has_photo === "false") { clauses.push("NOT EXISTS (SELECT 1 FROM photos p WHERE p.beer_id = beers.id AND p.deleted_at IS NULL)"); }
    const tagIds = filters.tag_ids?.filter(Boolean) || (filters.tag_id ? [filters.tag_id] : []);
    if (tagIds.length === 1) {
      clauses.push("EXISTS (SELECT 1 FROM beer_flavor_tags bft WHERE bft.beer_id = beers.id AND bft.tag_id = ? AND bft.deleted_at IS NULL)");
      params.push(tagIds[0]);
    } else if (tagIds.length > 1 && filters.tag_match === "or") {
      clauses.push(`EXISTS (SELECT 1 FROM beer_flavor_tags bft WHERE bft.beer_id = beers.id AND bft.tag_id IN (${tagIds.map(() => "?").join(",")}) AND bft.deleted_at IS NULL)`);
      params.push(...tagIds);
    } else if (tagIds.length > 1) {
      for (const tagId of tagIds) {
        clauses.push("EXISTS (SELECT 1 FROM beer_flavor_tags bft WHERE bft.beer_id = beers.id AND bft.tag_id = ? AND bft.deleted_at IS NULL)");
        params.push(tagId);
      }
    }
    const orderBy = filters.order === "rating" ? "overall_rating_scaled IS NULL, overall_rating_scaled DESC, name COLLATE NOCASE"
      : filters.order === "tastings" ? "(SELECT COUNT(*) FROM tastings t WHERE t.beer_id = beers.id AND t.deleted_at IS NULL) DESC, name COLLATE NOCASE"
      : filters.order === "recent" ? "(SELECT MAX(t.consumed_at) FROM tastings t WHERE t.beer_id = beers.id AND t.deleted_at IS NULL) IS NULL, (SELECT MAX(t.consumed_at) FROM tastings t WHERE t.beer_id = beers.id AND t.deleted_at IS NULL) DESC, name COLLATE NOCASE"
      : "name COLLATE NOCASE, created_at DESC";
    const result = await db.query(`SELECT beers.*,
      (SELECT AVG(t.rating_scaled) FROM tastings t WHERE t.beer_id = beers.id AND t.deleted_at IS NULL) AS average_rating_scaled,
      (SELECT COUNT(*) FROM tastings t WHERE t.beer_id = beers.id AND t.deleted_at IS NULL) AS tasting_count,
      (SELECT MAX(t.consumed_at) FROM tastings t WHERE t.beer_id = beers.id AND t.deleted_at IS NULL) AS latest_tasted_at
      FROM beers WHERE ${clauses.join(" AND ")} ORDER BY ${orderBy}`, params);
    const rows = (result.values || []).map(mapRow);
    const grouped = await listTagsForBeers(db, rows.map((row) => row.id));
    rows.forEach((beer) => { beer.flavor_tags = grouped.get(beer.id) || []; });
    return rows;
  }

  async searchBeers(query) { return this.listBeers({ query }); }
  async filterBeers(filters) { return this.listBeers(filters); }

  async updateBeer(id, input) {
    const values = normalizeInput(input);
    const timestamp = now();
    await withTransaction(async (db) => {
      await db.run(`UPDATE beers SET
      name = ?, brand = ?, brewery = ?, country_code = ?, country_name = ?, style = ?, category = ?,
      abv_scaled = ?, plato_scaled = ?, default_volume_ml = ?, personal_note = ?, overall_rating_scaled = ?,
      mouthfeel_rating = ?, bitterness_rating = ?, complexity_rating = ?, updated_at = ?,
      sync_status = 'pending_update', revision = revision + 1
      WHERE id = ? AND deleted_at IS NULL`, [
      values.name, values.brand, values.brewery, values.country_code, values.country_name, values.style,
      values.category, values.abv_scaled, values.plato_scaled, values.default_volume_ml, values.personal_note,
      values.overall_rating_scaled, values.mouthfeel_rating, values.bitterness_rating,
      values.complexity_rating, timestamp, id,
      ], false);
      await setBeerTagsSafely(db, id, values.flavor_tags);
    });
    return this.getBeerById(id);
  }

  async softDeleteBeer(id) {
    const timestamp = now();
    await withTransaction((db) => db.run(
      "UPDATE beers SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete', revision = revision + 1 WHERE id = ? AND deleted_at IS NULL",
      [timestamp, timestamp, id], false,
    ));
    return this.getBeerById(id);
  }

  async restoreBeer(id) {
    const timestamp = now();
    await withTransaction((db) => db.run(
      "UPDATE beers SET deleted_at = NULL, updated_at = ?, sync_status = 'pending_update', revision = revision + 1 WHERE id = ?",
      [timestamp, id], false,
    ));
    return this.getBeerById(id);
  }

  async listDeletedBeers() { return this.listBeers({ includeDeleted: true }); }
}

export const beerRepository = new BeerRepository();
