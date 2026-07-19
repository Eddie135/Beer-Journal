import { initializeDatabase, withTransaction } from "./database.js";

const now = () => new Date().toISOString();
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const text = (value) => String(value ?? "").trim();

function positiveInteger(value, label, { required = false } = {}) {
  if (value === "" || value === null || value === undefined) {
    if (required) throw new Error(`${label}不能为空`);
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label}必须是正整数`);
  return number;
}

function scaled(value, factor, label) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}格式不正确`);
  return Math.round(number * factor);
}

function normalizeInput(input, { requireBeer = true } = {}) {
  const beerId = text(input.beer_id);
  if (requireBeer && !beerId) throw new Error("请选择关联啤酒");
  const consumedAt = text(input.consumed_at) || now();
  const ratingValue = scaled(input.rating, 10, "评分");
  if (ratingValue !== null && ratingValue > 100) throw new Error("评分必须在 0 到 10 之间");
  return {
    beer_id: beerId,
    consumed_at: consumedAt,
    location: text(input.location),
    volume_ml: positiveInteger(input.volume_ml, "容量"),
    bottle_count: positiveInteger(input.bottle_count, "瓶数", { required: true }),
    purchase_channel: text(input.purchase_channel),
    price_scaled: scaled(input.price, 100, "价格"),
    rating_scaled: ratingValue,
    note: text(input.note),
  };
}

function mapRow(row) {
  return {
    ...row,
    consumed_at: row.consumed_at || row.tasted_at || "",
    location: row.location ?? row.drinking_location ?? "",
    volume_ml: row.volume_ml ?? row.capacity_ml ?? null,
    bottle_count: row.bottle_count ?? row.bottle_count_scaled ?? null,
    price: row.price_scaled === null || row.price_scaled === undefined
      ? (row.price_minor === null || row.price_minor === undefined ? "" : (row.price_minor / 100).toFixed(2))
      : (row.price_scaled / 100).toFixed(2),
    rating: row.rating_scaled === null || row.rating_scaled === undefined
      ? (row.overall_rating_scaled === null || row.overall_rating_scaled === undefined ? "" : (row.overall_rating_scaled / 10).toFixed(1))
      : (row.rating_scaled / 10).toFixed(1),
    note: row.note ?? row.notes ?? "",
  };
}

async function ensureBeer(db, beerId) {
  const result = await db.query("SELECT id FROM beers WHERE id = ? AND deleted_at IS NULL LIMIT 1", [beerId]);
  if (!result.values?.[0]) throw new Error("关联的啤酒不存在或已删除");
}

export class TastingRepository {
  async createTasting(input) {
    const values = normalizeInput(input);
    const id = uuid();
    const timestamp = now();
    await withTransaction(async (db) => {
      await ensureBeer(db, values.beer_id);
      await db.run(`INSERT INTO tastings (
        id, beer_id, tasted_at, drinking_location, capacity_ml, bottle_count_scaled,
        purchase_channel, price_minor, overall_rating_scaled, notes,
        consumed_at, location, volume_ml, bottle_count, price_scaled, rating_scaled, note,
        created_at, updated_at, sync_status, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', 1)`, [
        id, values.beer_id, values.consumed_at, values.location, values.volume_ml, values.bottle_count,
        values.purchase_channel, values.price_scaled, values.rating_scaled, values.note,
        values.consumed_at, values.location, values.volume_ml, values.bottle_count, values.price_scaled,
        values.rating_scaled, values.note, timestamp, timestamp,
      ], false);
    });
    return this.getTastingById(id);
  }

  async getTastingById(id) {
    const { db } = await initializeDatabase();
    const result = await db.query(`SELECT t.*, b.name AS beer_name, b.brand AS beer_brand,
      b.country_code AS beer_country_code, b.country_name AS beer_country_name,
      b.style AS beer_style, b.category AS beer_category
      FROM tastings t JOIN beers b ON b.id = t.beer_id WHERE t.id = ? LIMIT 1`, [id]);
    return result.values?.[0] ? mapRow(result.values[0]) : null;
  }

  async listTastings(filters = {}) {
    const { db } = await initializeDatabase();
    const clauses = [filters.includeDeleted ? "1 = 1" : "t.deleted_at IS NULL", filters.includeDeleted ? "1 = 1" : "b.deleted_at IS NULL"];
    const params = [];
    const query = text(filters.query);
    if (query) {
      clauses.push("(b.name LIKE ? OR b.brand LIKE ? OR b.country_name LIKE ? OR t.location LIKE ? OR t.note LIKE ?)");
      const pattern = `%${query}%`;
      params.push(pattern, pattern, pattern, pattern, pattern);
    }
    if (filters.beer_id) { clauses.push("t.beer_id = ?"); params.push(filters.beer_id); }
    if (filters.from) { clauses.push("t.consumed_at >= ?"); params.push(filters.from); }
    if (filters.to) { clauses.push("t.consumed_at <= ?"); params.push(filters.to); }
    if (filters.min_rating !== "" && filters.min_rating !== undefined) { clauses.push("t.rating_scaled >= ?"); params.push(Number(filters.min_rating) * 10); }
    if (filters.max_rating !== "" && filters.max_rating !== undefined) { clauses.push("t.rating_scaled <= ?"); params.push(Number(filters.max_rating) * 10); }
    const order = filters.order === "oldest" ? "t.consumed_at ASC, t.created_at ASC" : "t.consumed_at DESC, t.created_at DESC";
    const result = await db.query(`SELECT t.*, b.name AS beer_name, b.brand AS beer_brand,
      b.country_code AS beer_country_code, b.country_name AS beer_country_name,
      b.style AS beer_style, b.category AS beer_category
      FROM tastings t JOIN beers b ON b.id = t.beer_id
      WHERE ${clauses.join(" AND ")} ORDER BY ${order}`, params);
    return (result.values || []).map(mapRow);
  }

  async listTastingsByBeerId(beerId) { return this.listTastings({ beer_id: beerId }); }
  async searchTastings(query) { return this.listTastings({ query }); }
  async filterTastings(filters) { return this.listTastings(filters); }

  async updateTasting(id, input) {
    const values = normalizeInput(input);
    const timestamp = now();
    await withTransaction(async (db) => {
      await ensureBeer(db, values.beer_id);
      await db.run(`UPDATE tastings SET
        beer_id = ?, tasted_at = ?, drinking_location = ?, capacity_ml = ?, bottle_count_scaled = ?,
        purchase_channel = ?, price_minor = ?, overall_rating_scaled = ?, notes = ?,
        consumed_at = ?, location = ?, volume_ml = ?, bottle_count = ?, price_scaled = ?, rating_scaled = ?, note = ?,
        updated_at = ?, sync_status = 'pending_update', revision = revision + 1
        WHERE id = ? AND deleted_at IS NULL`, [
        values.beer_id, values.consumed_at, values.location, values.volume_ml, values.bottle_count,
        values.purchase_channel, values.price_scaled, values.rating_scaled, values.note,
        values.consumed_at, values.location, values.volume_ml, values.bottle_count, values.price_scaled,
        values.rating_scaled, values.note, timestamp, id,
      ], false);
    });
    return this.getTastingById(id);
  }

  async softDeleteTasting(id) {
    const timestamp = now();
    await withTransaction((db) => db.run(
      "UPDATE tastings SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete', revision = revision + 1 WHERE id = ? AND deleted_at IS NULL",
      [timestamp, timestamp, id], false,
    ));
    return this.getTastingById(id);
  }

  async restoreTasting(id) {
    const timestamp = now();
    await withTransaction((db) => db.run(
      "UPDATE tastings SET deleted_at = NULL, updated_at = ?, sync_status = 'pending_update', revision = revision + 1 WHERE id = ?",
      [timestamp, id], false,
    ));
    return this.getTastingById(id);
  }

  async getStats() {
    const { db } = await initializeDatabase();
    const result = await db.query(`SELECT COUNT(*) AS tasting_count,
      COALESCE(SUM(t.bottle_count), 0) AS bottle_count,
      AVG(t.rating_scaled) AS average_rating_scaled
      FROM tastings t JOIN beers b ON b.id = t.beer_id
      WHERE t.deleted_at IS NULL AND b.deleted_at IS NULL`);
    return result.values?.[0] || { tasting_count: 0, bottle_count: 0, average_rating_scaled: null };
  }

  async getStatsByBeerId(beerId) {
    const { db } = await initializeDatabase();
    const result = await db.query(`SELECT COUNT(*) AS tasting_count,
      COALESCE(SUM(bottle_count), 0) AS bottle_count,
      MAX(consumed_at) AS latest_consumed_at,
      AVG(rating_scaled) AS average_rating_scaled
      FROM tastings WHERE beer_id = ? AND deleted_at IS NULL`, [beerId]);
    return result.values?.[0] || { tasting_count: 0, bottle_count: 0, latest_consumed_at: null, average_rating_scaled: null };
  }

  async listDeletedTastings() {
    const rows = await this.listTastings({ includeDeleted: true });
    return rows.filter((tasting) => Boolean(tasting.deleted_at));
  }
}

export const tastingRepository = new TastingRepository();
