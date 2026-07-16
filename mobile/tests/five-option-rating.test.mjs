import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FIVE_OPTION_RATINGS, readFiveOptionRating, renderFiveOptionRating, renderFiveOptionSummary } from "../web/assets/five-option-rating.mjs";

const appSource = await readFile(new URL("../web/assets/app.js", import.meta.url), "utf8");

test("FiveOptionRating keeps the web reference options and values", () => {
  assert.deepEqual(FIVE_OPTION_RATINGS.mouthfeel_rating.options, [
    [1, "清爽"], [2, "偏清爽"], [3, "平衡"], [4, "偏醇厚"], [5, "醇厚"],
  ]);
  assert.deepEqual(FIVE_OPTION_RATINGS.bitterness_rating.options, [
    [1, "淡"], [2, "微苦"], [3, "平衡"], [4, "偏苦"], [5, "苦"],
  ]);
  assert.deepEqual(FIVE_OPTION_RATINGS.complexity_rating.options, [
    [1, "简单"], [2, "较简单"], [3, "平衡"], [4, "较复杂"], [5, "复杂"],
  ]);
});

test("FiveOptionRating renders an editable radio group and echoes the selected value", () => {
  const html = renderFiveOptionRating("mouthfeel_rating", 4);
  assert.match(html, /data-five-option-rating="mouthfeel_rating"/);
  assert.match(html, /name="mouthfeel_rating" value="4" checked/);
  assert.match(html, /清爽/);
  assert.match(html, /偏醇厚/);
  assert.match(html, /醇厚/);
  assert.equal((html.match(/name="mouthfeel_rating"/g) || []).length, 6);
});

test("FiveOptionRating keeps an empty value selectable and renders detail summaries", () => {
  const empty = renderFiveOptionRating("bitterness_rating");
  assert.match(empty, /value="" checked/);
  assert.match(renderFiveOptionSummary("complexity_rating", 5), /★★★★★/);
  assert.match(renderFiveOptionSummary("complexity_rating", 5), /简单/);
  assert.match(renderFiveOptionSummary("complexity_rating", 5), /复杂/);
  assert.equal(readFiveOptionRating({ elements: { namedItem: () => ({ value: "4" }) } }, "complexity_rating"), "4");
});

test("Beer add/edit pages use the component and Beer details use the same values", () => {
  assert.match(appSource, /from "\.\/five-option-rating\.mjs"/);
  assert.match(appSource, /renderFiveOptionRating\("mouthfeel_rating", beer\?\.mouthfeel_rating\)/);
  assert.match(appSource, /renderFiveOptionRating\("bitterness_rating", beer\?\.bitterness_rating\)/);
  assert.match(appSource, /renderFiveOptionRating\("complexity_rating", beer\?\.complexity_rating\)/);
  assert.match(appSource, /renderFiveOptionSummary\("mouthfeel_rating", beer\.mouthfeel_rating\)/);
  assert.match(appSource, /renderFiveOptionSummary\("bitterness_rating", beer\.bitterness_rating\)/);
  assert.match(appSource, /renderFiveOptionSummary\("complexity_rating", beer\.complexity_rating\)/);
  assert.doesNotMatch(appSource, /name="mouthfeel_rating" type="number"/);
  assert.doesNotMatch(appSource, /name="bitterness_rating" type="number"/);
  assert.doesNotMatch(appSource, /name="complexity_rating" type="number"/);
  assert.match(appSource, /beerRepository\.createBeer\(payload\)/);
  assert.match(appSource, /beerRepository\.updateBeer\(form\.dataset\.beerId, payload\)/);
});
