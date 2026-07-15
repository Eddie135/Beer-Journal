import assert from "node:assert/strict";
import test from "node:test";
import { DB_NAME, MIGRATIONS, REQUIRED_TABLES, SCHEMA_VERSION } from "../web/assets/schema.mjs";

test("schema has a stable database name and version", () => {
  assert.equal(DB_NAME, "beer_journal");
  assert.equal(SCHEMA_VERSION, 1);
  assert.equal(MIGRATIONS[0].version, 1);
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
