import assert from "node:assert/strict";
import test from "node:test";
import { DB_NAME, MIGRATIONS, REQUIRED_TABLES, SCHEMA_VERSION } from "../web/assets/schema.mjs";

test("schema uses stable local database name and version 4", () => {
  assert.equal(DB_NAME, "beer_journal");
  assert.equal(SCHEMA_VERSION, 4);
  assert.deepEqual(MIGRATIONS.map((migration) => migration.version), [1, 2, 3, 4]);
});

test("initial migration contains all local entities and sync fields", () => {
  const sql = MIGRATIONS[0].statements.join("\n");
  for (const table of REQUIRED_TABLES.filter((name) => name !== "schema_migrations")) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  for (const field of ["id TEXT PRIMARY KEY", "remote_id TEXT", "owner_id TEXT", "deleted_at TEXT", "sync_status TEXT", "revision INTEGER"]) assert.match(sql, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("money and score columns stay integer-scaled", () => {
  const sql = MIGRATIONS[0].statements.join("\n");
  for (const column of ["abv_scaled INTEGER", "plato_scaled INTEGER", "overall_rating_scaled INTEGER", "price_minor INTEGER"]) assert.match(sql, new RegExp(column));
});

test("migration 1 to 2 preserves legacy tasting values", () => {
  const sql = MIGRATIONS[1].statements.join("\n");
  for (const column of ["consumed_at", "location", "volume_ml", "bottle_count", "price_scaled", "rating_scaled", "note"]) assert.match(sql, new RegExp(`ADD COLUMN ${column}`));
  assert.match(sql, /SET consumed_at = tasted_at/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM beers|DROP DATABASE/);
});

test("migration 2 to 3 adds tag sync fields and active indexes", () => {
  const sql = MIGRATIONS[2].statements.join("\n");
  for (const field of ["remote_id", "owner_id", "sync_status", "revision"]) assert.match(sql, new RegExp(`ALTER TABLE flavor_tags ADD COLUMN ${field}`));
  assert.match(sql, /idx_beer_flavor_tags_beer_active/);
});

test("migration 3 to 4 extends photos without destructive operations", () => {
  const sql = MIGRATIONS[3].statements.join("\n");
  for (const field of ["thumbnail_path", "deleted_at", "remote_id", "owner_id", "is_cover"]) assert.match(sql, new RegExp(`ADD COLUMN ${field}`));
  for (const index of ["idx_photos_beer_active_order", "idx_photos_tasting_active_order", "idx_photos_deleted_at", "idx_tastings_beer_consumed_active"]) assert.match(sql, new RegExp(index));
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM beers|DROP DATABASE/);
});
