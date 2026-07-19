import assert from "node:assert/strict";
import test from "node:test";
import { updateFilterSheetPreservingScroll } from "../web/assets/filter-sheet-scroll.mjs";

function fakeSheet(scrollTop, html) {
  const container = { scrollTop, innerHTML: html };
  return {
    container,
    querySelector(selector) { return selector === ".collection-filters" ? container : null; },
  };
}

test("filter choice updates preserve the existing sheet scroll position", () => {
  const current = fakeSheet(428, "排序");
  const next = fakeSheet(0, "排序（已选择最新录入）");
  assert.equal(updateFilterSheetPreservingScroll(current, next), true);
  assert.equal(current.container.scrollTop, 428);
  assert.equal(current.container.innerHTML, "排序（已选择最新录入）");
});

test("filter sheet update fails safely when the scroll container is absent", () => {
  assert.equal(updateFilterSheetPreservingScroll({}, {}), false);
});
