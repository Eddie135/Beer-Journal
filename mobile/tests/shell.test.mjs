import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const index = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/assets/app.js", import.meta.url), "utf8");
const database = await readFile(new URL("../web/assets/database.js", import.meta.url), "utf8");

test("App Shell is static and route rendering targets only route-content", () => {
  assert.match(index, /id="app-shell"[^>]*data-app-shell/);
  assert.match(index, /id="app-logo"[^>]*src="assets\/beer-journal-icon\.png"/);
  assert.match(index, /id="route-content"[^>]*class="local-route-content"/);
  assert.match(index, /id="bottom-nav"[^>]*data-app-bottom-nav/);
  assert.match(app, /document\.querySelector\("#route-content"\)/);
  assert.match(app, /globalThis\.__BEER_JOURNAL_SHELL_DEBUG__/);
  assert.match(app, /preloadLogo/);
  assert.doesNotMatch(app, /const bottomNav\s*=/);
});

test("SQLite bridge is bundled through npm imports", () => {
  assert.doesNotMatch(index, /sqlite-plugin\.js/);
  assert.match(database, /from "@capacitor\/core"/);
  assert.match(database, /from "@capacitor-community\/sqlite"/);
  assert.doesNotMatch(database, /window\.Capacitor\?\.Plugins/);
});

test("Add Beer routes to the create form before the detail route", () => {
  const createRoute = app.indexOf('if (currentPath === "/beers/new")');
  const detailRoute = app.indexOf("const beerId = parseBeerDetailRoute(currentPath);");
  assert.ok(createRoute >= 0);
  assert.ok(detailRoute >= 0);
  assert.ok(createRoute < detailRoute);
  assert.doesNotMatch(app, /currentPath\.startsWith\(["']\/beers\/["']\)/);
  assert.match(app, /data-add-beer/);
  assert.match(app, /data-beer-form/);
  assert.match(app, /beerRepository\.createBeer\(payload\)/);
  assert.match(app, /else firstTastingSheet\(beer\)/);
  assert.ok(app.includes('"/beers/new"'));
});

test("Add Beer page uses clean user-facing copy", () => {
  assert.match(app, /shell\(beerForm\(\), "添加啤酒", "记录一款新的啤酒收藏"\)/);
  assert.doesNotMatch(app, /娣诲姞鍟ら厭|淇濆瓨鍒版湰鏈\?SQLite/);
  assert.match(index, /<meta charset="UTF-8">/i);
});

test("Android back prioritizes the overlay stack", () => {
  assert.match(app, /import \{ overlayManager \} from "\.\/overlay-manager\.mjs"/);
  assert.match(app, /if \(overlayManager\.hasOpenOverlay\(\)\) \{ overlayManager\.closeTopOverlay\(\); return; \}/);
  assert.match(app, /overlayManager\.openOverlay\(\{ id: "country-picker"/);
  assert.match(app, /const overlayId = `choice-\$\{type\}`/);
  assert.match(app, /overlayManager\.openOverlay\(\{ id: "tasting-actions"/);
  assert.match(app, /overlayManager\.openOverlay\(\{ id: "first-tasting"/);
  assert.match(app, /openDeleteConfirm\("tasting"/);
  const back = app.slice(app.indexOf("async function goBack"));
  assert.ok(back.indexOf("if (isKeyboardVisible())") < back.indexOf("if (overlayManager.hasOpenOverlay())"));
  assert.ok(back.indexOf("if (overlayManager.hasOpenOverlay())") < back.indexOf("window.history.back()"));
  assert.match(app, /data-filter-open/);
  assert.match(app, /id: "filter-sheet"/);
});
