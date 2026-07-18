import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const photo = await readFile(new URL("../web/assets/photo-repository.js", import.meta.url), "utf8");
const stats = await readFile(new URL("../web/assets/stats-repository.js", import.meta.url), "utf8");
const backup = await readFile(new URL("../web/assets/backup-service.js", import.meta.url), "utf8");

test("photo repository keeps private relative paths and safe processing limits", () => {
  assert.match(photo, /PHOTO_DIRECTORY = "beer-journal\/photos"/);
  assert.match(photo, /MAX_EDGE = 2048/);
  assert.match(photo, /THUMB_EDGE = 480/);
  assert.match(photo, /MAX_BYTES = 2_500_000/);
  assert.match(photo, /image\/webp/);
  assert.match(photo, /directory: "DATA"/);
  assert.match(photo, /softDeletePhoto/);
  assert.match(photo, /restorePhoto/);
  assert.match(photo, /listDeletedPhotos/);
  assert.doesNotMatch(photo, /data:image.*INSERT|base64.*INSERT/);
});

test("stats repository excludes soft-deleted records and provides complete dashboard aggregates", () => {
  assert.match(stats, /b\.deleted_at IS NULL/);
  assert.match(stats, /t\.deleted_at IS NULL/);
  for (const field of ["beer_count", "tasting_count", "bottle_count", "total_volume_ml", "country_count", "average_tasting_rating_scaled", "average_abv_scaled", "average_plato_scaled", "total_spend_scaled"]) assert.match(stats, new RegExp(field));
  assert.match(stats, /substr\(t\.consumed_at, 1, 7\)/);
});

test("backup service exports schema, rows, files and imports transactionally", () => {
  assert.match(backup, /format: "beer-journal-backup"/);
  assert.match(backup, /schema_version: SCHEMA_VERSION/);
  assert.match(backup, /const TABLES =/);
  assert.match(backup, /INSERT OR IGNORE/);
  assert.match(backup, /withTransaction/);
  assert.match(backup, /for \(const path of written\)/);
  assert.match(backup, /validate\(backup\)/);
});
