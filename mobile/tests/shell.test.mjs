import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const index = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/assets/app.js", import.meta.url), "utf8");
const database = await readFile(new URL("../web/assets/database.js", import.meta.url), "utf8");
const schema = await readFile(new URL("../web/assets/schema.mjs", import.meta.url), "utf8");
const css = await readFile(new URL("../web/assets/local.css", import.meta.url), "utf8");

test("App Shell is stable and only route-content is replaced", () => {
  assert.match(index, /id="app-shell"[^>]*data-app-shell/);
  assert.match(index, /id="app-logo"[^>]*src="assets\/beer-journal-icon\.png"/);
  assert.match(index, /id="route-content"[^>]*class="local-route-content"/);
  assert.match(index, /data-app-bottom-nav/);
  assert.match(index, /id="overlay-root"/);
  assert.match(app, /document\.querySelector\("#route-content"\)/);
  assert.match(app, /__BEER_JOURNAL_SHELL_DEBUG__/);
  assert.match(app, /preloadLogo/);
});

test("Vite app uses the native SQLite npm bridge and schema 4", () => {
  assert.match(database, /from "@capacitor\/core"/);
  assert.match(database, /from "@capacitor-community\/sqlite"/);
  assert.doesNotMatch(database, /window\.Capacitor\?\.Plugins/);
  assert.match(schema, /SCHEMA_VERSION = 4/);
  assert.match(app, /photo-repository\.js/);
  assert.match(app, /stats-repository\.js/);
  assert.match(app, /backup-service\.js/);
});

test("Beer routes separate create, edit, and UUID detail paths", () => {
  assert.match(app, /current === "\/beers\/new"/);
  assert.match(app, /parseBeerEditRoute\(current\)/);
  assert.match(app, /parseBeerDetailRoute\(current\)/);
  assert.match(app, /data-add-beer/);
  assert.match(app, /beerRepository\.createBeer\(payload\)/);
  assert.match(app, /firstTastingSheet\(beer\)/);
});

test("full local workflows are represented in the app", () => {
  for (const text of ["添加啤酒", "记录饮用", "个人数据", "data-beer-form", "data-tasting-form", "data-tag-editor", "data-photo-input", "data-filter-open", "data-backup-export", "data-restore-beer", "data-restore-tasting"]) assert.match(app, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(app, /tastingRepository\.createTasting\(payload\)/);
  assert.match(app, /tastingRepository\.updateTasting/);
  assert.match(app, /photoRepository\.addPhoto/);
});

test("overlay back handling and mobile safe-area styles are present", () => {
  assert.match(app, /overlayManager\.hasOpenOverlay\(\)/);
  assert.match(app, /overlayManager\.closeTopOverlay\(\)/);
  assert.match(app, /data-country-picker/);
  assert.match(app, /data-choice-picker/);
  assert.match(app, /data-date-picker/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /-webkit-tap-highlight-color:\s*transparent/);
});

test("normal UI has no debug build labels or mojibake markers", () => {
  assert.doesNotMatch(index, /Build:\s*beta|Version code:/);
  assert.doesNotMatch(app, /锟|鐜|淇濆|�/);
});
