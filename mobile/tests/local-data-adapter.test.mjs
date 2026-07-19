import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const adapter = await readFile(new URL("../web/assets/local-data-adapter.js", import.meta.url), "utf8");
const backup = await readFile(new URL("../web/assets/backup-service.js", import.meta.url), "utf8");

test("LocalDataAdapter exposes the complete local page boundary", () => {
  for (const method of [
    "listBeers", "getBeer", "createBeer", "updateBeer", "deleteBeer", "restoreBeer",
    "listTastings", "getTasting", "createTasting", "updateTasting",
    "listTags", "setBeerTags", "searchBeers", "filterBeers", "sortBeers",
    "getStatistics", "addBeerPhotos", "addTastingPhotos", "deletePhoto", "restorePhoto",
    "exportBackup", "importBackup",
  ]) assert.match(adapter, new RegExp(`${method}:`), `adapter method ${method}`);
});

test("presentation adapter delegates to repositories and contains no SQL", () => {
  assert.match(adapter, /beerRepository|tastingRepository|tagRepository|photoRepository|statsRepository|backupService/);
  assert.doesNotMatch(adapter, /SELECT\s+|INSERT\s+|UPDATE\s+|DELETE\s+/i);
});

test("native backup export writes a real local file", () => {
  assert.match(backup, /isNativePlatform\?\.\(\)\s*\|\|\s*globalThis\.Capacitor\?\.getPlatform\?\.\(\)\s*===\s*"android"/);
  assert.match(backup, /writeFile\(\{ path, data: base64Json\(backup\), directory: "DATA"/);
});
