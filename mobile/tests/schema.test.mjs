import assert from "node:assert/strict";
import test from "node:test";
import { DB_NAME, MIGRATIONS, REQUIRED_TABLES, SCHEMA_VERSION } from "../web/assets/schema.mjs";

test("schema has a stable database name and version", () => {
  assert.equal(DB_NAME, "beer_journal");
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(MIGRATIONS[0].version, 1);
  assert.equal(MIGRATIONS[1].version, 2);
});

test("initial migration includes the required local tables and sync fields", () => {
  const sql = MIGRATIONS[0].statements.join("\n");
  for (const table of REQUIRED_TABLES.filter((name) => name !== "schema_migrations")) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  for (const field of ["id TEXT PRIMARY KEY", "remote_id TEXT", "owner_id TEXT", "deleted_at TEXT", "sync_status TEXT", "revision INTEGER"]) {
    assert.match(sql, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("money and score columns use integer scaling", () => {
  const sql = MIGRATIONS[0].statements.join("\n");
  assert.match(sql, /abv_scaled INTEGER/);
  assert.match(sql, /plato_scaled INTEGER/);
  assert.match(sql, /overall_rating_scaled INTEGER/);
  assert.match(sql, /price_minor INTEGER/);
});

test("migration 1 to 2 preserves legacy tasting values", () => {
  const sql = MIGRATIONS[1].statements.join("\n");
  for (const column of ["consumed_at", "location", "volume_ml", "bottle_count", "price_scaled", "rating_scaled", "note"]) {
    assert.match(sql, new RegExp(`ADD COLUMN ${column}`));
  }
  assert.match(sql, /SET consumed_at = tasted_at/);
  assert.match(sql, /SET location = drinking_location/);
  assert.match(sql, /SET volume_ml = capacity_ml/);
  assert.match(sql, /idx_tastings_beer_active/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM beers|DROP DATABASE/);
});
