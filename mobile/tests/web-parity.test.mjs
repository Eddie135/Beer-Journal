import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const localApp = await readFile(new URL("../web/assets/app.js", import.meta.url), "utf8");
const localCss = await readFile(new URL("../web/assets/app.css", import.meta.url), "utf8");
const referenceCss = await readFile("D:/BEER-JORNAL-WEB-REFERENCE/core/static/css/app.css", "utf8").catch(() => "");

test("local presentation uses the reference page vocabulary", () => {
  for (const token of ["collection-hero", "collection-card", "record-form", "beer-profile-hero", "detail-summary", "journal-hero", "journal-entry", "diary-hero", "profile-insight-hero", "experience-profile", "profile-trend-chart", "spending-grid", "recent-tasting", "beer-picker-card"]) assert.match(localApp, new RegExp(token));
  for (const token of ["collection-card", "record-form", "beer-profile-hero", "journal-entry", "diary-hero", "profile-insight-hero", "experience-profile", "profile-trend-chart", "spending-grid", "recent-tasting"]) assert.match(localCss, new RegExp(`\\.${token}`));
});

test("web reference CSS remains the canonical source", () => {
  if (!referenceCss) return;
  for (const token of ["--accent", "--radius-card", ".collection-card", ".record-form", ".beer-profile-hero", ".journal-entry", ".diary-hero", ".profile-insight-hero"]) assert.match(localCss, new RegExp(token.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
});

test("offline adapter is the only presentation data boundary", () => {
  assert.doesNotMatch(localApp, /import .*?(beer|tasting|photo|stats)-repository/);
  assert.doesNotMatch(localApp, /SELECT\\s|INSERT\\s|UPDATE\\s|DELETE\\s/i);
  assert.match(localApp, /localDataAdapter/);
});
