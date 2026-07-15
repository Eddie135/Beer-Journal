import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const index = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/assets/app.js", import.meta.url), "utf8");

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
