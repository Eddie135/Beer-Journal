import { initializeDatabase, withTransaction } from "./database.js";

const now = () => new Date().toISOString();
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  };
}

function mapRow(row) {
  return {
    ...row,
    abv: row.abv_scaled === null ? "" : (row.abv_scaled / 100).toFixed(2).replace(/\.00$/, ""),
    plato: row.plato_scaled === null ? "" : (row.plato_scaled / 100).toFixed(2).replace(/\.00$/, ""),
    overall_rating: row.overall_rating_scaled === null ? "" : (row.overall_rating_scaled / 10).toFixed(1),
  };
}

export class BeerRepository {
  async createBeer(input) {
    const values = normalizeInput(input);
    const id = uuid();
    const timestamp = now();
    await withTransaction((db) => db.run(`INSERT INTO beers (
      id, remote_id, owner_id, name, brand, brewery, country_code, country_name,
      style, category, abv_scaled, plato_scaled, default_volume_ml, personal_note,
      overall_rating_scaled, mouthfeel_rating, bitterness_rating, complexity_rating,
      created_at, updated_at, sync_status, revision
    ) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', 1)`, [
      id, values.name, values.brand, values.brewery, values.country_code, values.country_name,
      values.style, values.category, values.abv_scaled, values.plato_scaled, values.default_volume_ml,
      values.personal_note, values.overall_rating_scaled, values.mouthfeel_rating,
      values.bitterness_rating, values.complexity_rating, timestamp, timestamp,
    ], false));
    return this.getBeerById(id);
  }

  async getBeerById(id) {
    const { db } = await initializeDatabase();
    const result = await db.query("SELECT * FROM beers WHERE id = ? LIMIT 1", [id]);
    return result.values?.[0] ? mapRow(result.values[0]) : null;
  }

  async listBeers(filters = {}) {
    const { db } = await initializeDatabase();
    const clauses = ["deleted_at IS NULL"];
    const params = [];
    const query = text(filters.query);
    if (query) {
      clauses.push("(name LIKE ? OR brand LIKE ? OR brewery LIKE ? OR country_name LIKE ? OR style LIKE ? OR category LIKE ?)");
      const pattern = `%${query}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }
    if (filters.category) { clauses.push("category = ?"); params.push(filters.category); }
    if (filters.country_code) { clauses.push("country_code = ?"); params.push(filters.country_code); }
    if (filters.min_rating !== "" && filters.min_rating !== undefined) { clauses.push("overall_rating_scaled >= ?"); params.push(Number(filters.min_rating) * 10); }
    if (filters.max_rating !== "" && filters.max_rating !== undefined) { clauses.push("overall_rating_scaled <= ?"); params.push(Number(filters.max_rating) * 10); }
    const result = await db.query(`SELECT * FROM beers WHERE ${clauses.join(" AND ")} ORDER BY name COLLATE NOCASE, created_at DESC`, params);
    return (result.values || []).map(mapRow);
  }

  async searchBeers(query) { return this.listBeers({ query }); }
  async filterBeers(filters) { return this.listBeers(filters); }

  async updateBeer(id, input) {
    const values = normalizeInput(input);
    const timestamp = now();
    await withTransaction((db) => db.run(`UPDATE beers SET
      name = ?, brand = ?, brewery = ?, country_code = ?, country_name = ?, style = ?, category = ?,
      abv_scaled = ?, plato_scaled = ?, default_volume_ml = ?, personal_note = ?, overall_rating_scaled = ?,
      mouthfeel_rating = ?, bitterness_rating = ?, complexity_rating = ?, updated_at = ?,
      sync_status = 'pending_update', revision = revision + 1
      WHERE id = ? AND deleted_at IS NULL`, [
      values.name, values.brand, values.brewery, values.country_code, values.country_name, values.style,
      values.category, values.abv_scaled, values.plato_scaled, values.default_volume_ml, values.personal_note,
      values.overall_rating_scaled, values.mouthfeel_rating, values.bitterness_rating,
      values.complexity_rating, timestamp, id,
    ], false));
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
}

export const beerRepository = new BeerRepository();
