import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const index = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/assets/app.js", import.meta.url), "utf8");
const database = await readFile(new URL("../web/assets/database.js", import.meta.url), "utf8");
const schema = await readFile(new URL("../web/assets/schema.mjs", import.meta.url), "utf8");
const css = await readFile(new URL("../web/assets/local.css", import.meta.url), "utf8");
const appCss = await readFile(new URL("../web/assets/app.css", import.meta.url), "utf8");

test("App Shell is stable and only route-content is replaced", () => {
  assert.match(index, /id="app-logo"[^>]*src="assets\/beer-journal-icon\.png"/);
  assert.match(index, /class="app-content"[^>]*id="route-content"/);
  assert.match(index, /data-app-bottom-nav/);
  assert.match(index, /class="app-shell"[^>]*data-app-shell/);
  assert.match(index, /id="overlay-root"/);
  assert.match(app, /document\.querySelector\("#route-content"\)/);
  assert.match(app, /__BEER_JOURNAL_SHELL_DEBUG__/);
  assert.match(app, /preloadLogo/);
});

test("route rendering does not duplicate the App Shell hero", () => {
  assert.match(app, /function shell\(content, title = "", subtitle = ""\)/);
  assert.match(app, /hasRouteHeading/);
  assert.match(app, /function verifyRouteStructure\(\)/);
  assert.match(app, /querySelectorAll\("h1"\)/);
  assert.match(app, /querySelectorAll\("\.screen-heading, \.collection-hero, \.journal-hero/);
  assert.equal((index.match(/data-app-header/g) || []).length, 1);
  assert.equal((index.match(/id="app-logo"/g) || []).length, 1);
  assert.equal((index.match(/data-app-bottom-nav/g) || []).length, 1);
  assert.match(appCss, /\.app-shell\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/s);
  assert.match(appCss, /\.app-content\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(appCss, /\.bottom-tab-bar\s*\{[^}]*position:\s*relative/s);
  assert.doesNotMatch(css, /\.app-content\s*\{\s*padding-bottom:/);
});

test("Vite app uses the native SQLite npm bridge and schema 4", () => {
  assert.match(database, /from "@capacitor\/core"/);
  assert.match(database, /from "@capacitor-community\/sqlite"/);
  assert.doesNotMatch(database, /window\.Capacitor\?\.Plugins/);
  assert.match(schema, /SCHEMA_VERSION = 4/);
  assert.match(app, /local-data-adapter\.js/);
});

test("Beer routes separate create, edit, and UUID detail paths", () => {
  assert.match(app, /current === "\/beers\/new"/);
  assert.match(app, /parseBeerEditRoute\(current\)/);
  assert.match(app, /parseBeerDetailRoute\(current\)/);
  assert.match(app, /data-add-beer/);
  assert.match(app, /localDataAdapter\.createBeer\(payload\)/);
  assert.match(app, /firstTastingSheet\(beer\)/);
});

test("Tasting edit preserves the stored Beer relation", () => {
  assert.match(app, /const selectedBeer = beer \|\| tasting/);
  assert.match(app, /name="beer_id" value=\"\$\{esc\(selectedBeer\.id \|\| selectedBeer\.beer_id\)\}\"/);
  assert.match(app, /const tasting = await localDataAdapter\.getTastingById\(tastingId\)/);
  assert.match(app, /beerInput\.value = tasting\.beer_id/);
  assert.doesNotMatch(app, /beerInput\.value = tastingId/);
});

test("full local workflows are represented in the app", () => {
  for (const text of ["添加啤酒", "记录饮用", "个人数据", "data-beer-form", "data-tasting-form", "data-tag-editor", "data-photo-input", "data-filter-open", "data-backup-export", "data-restore-beer", "data-restore-tasting"]) assert.match(app, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(app, /localDataAdapter\.createTasting\(payload\)/);
  assert.match(app, /localDataAdapter\.updateTasting/);
  assert.match(app, /localDataAdapter\.addPhoto/);
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

test("Beer filters expose individual clear controls after applying", () => {
  assert.match(app, /\$\{activeFilterSummary\(\)\}<div class="collection-section-heading">/);
  assert.match(app, /data-clear-filter="\$\{key\}"/);
});

test("final feedback fixes keep local controls and route history app-native", () => {
  assert.match(app, /data-purchase-picker/);
  assert.match(app, /openPurchaseChannelPicker/);
  assert.match(app, /data-photo-pending-delete/);
  assert.match(app, /navigate\(`\/beers\/\$\{beer\.id\}`, true\)/);
  assert.match(app, /Boolean\(form\.dataset\.tastingId\)/);
  assert.match(app, /app\.scrollTop = 0/);
  assert.match(app, /showToast\("再次按返回键退出 Beer Journal"\)/);
  assert.doesNotMatch(app, /window\.alert\(/);
  assert.match(css, /filter-sheet > \.collection-filters[^}]*overflow-y: auto/s);
  assert.match(css, /photo-remove-button/);
  assert.match(css, /app-toast/);
});

test("rc2 fix5 keeps first tasting feedback, route reset, and tag affordances", () => {
  assert.match(app, /submit\.textContent = "保存中…"/);
  assert.match(app, /firstTastingSheet\(beer\); void photoSave/);
  assert.match(app, /current === "\/beers\/new" \|\| current === "\/tastings\/new"/);
  assert.match(app, /requestAnimationFrame\(\(\) => \{ if \(serial === renderSerial\) app\.scrollTop = 0;/);
  assert.match(css, /\.local-first-tasting \.local-actions[^}]*gap: 12px/);
  assert.match(css, /\.local-first-tasting \.local-actions \.local-button[^}]*border-radius: 14px/);
  assert.match(css, /\.tag-editor \.local-tag-pill button[^}]*width: 32px/);
  assert.match(css, /\.tag-editor \.tag-remove:active/);
  assert.match(app, /order: "created"/);
  assert.match(app, /data-filter-order="created"/);
});

test("normal UI has no debug build labels or mojibake markers", () => {
  assert.doesNotMatch(index, /Build:\s*beta|Version code:/);
  assert.doesNotMatch(app, /锟|鐜|淇濆|�/);
});
