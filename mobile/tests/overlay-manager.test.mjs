import assert from "node:assert/strict";
import test from "node:test";
import { overlayManager, resetOverlayManagerForTests } from "../web/assets/overlay-manager.mjs";

test("overlay manager closes only the top nested overlay", () => {
  resetOverlayManagerForTests();
  const closed = [];
  overlayManager.openOverlay({ id: "tasting-actions", onClose: () => closed.push("actions") });
  overlayManager.openOverlay({ id: "delete-tasting", onClose: () => closed.push("confirm") });
  assert.equal(overlayManager.getTopOverlay().id, "delete-tasting");
  assert.equal(overlayManager.closeTopOverlay(), true);
  assert.deepEqual(closed, ["confirm"]);
  assert.equal(overlayManager.getTopOverlay().id, "tasting-actions");
  assert.equal(overlayManager.closeTopOverlay(), true);
  assert.deepEqual(closed, ["confirm", "actions"]);
  assert.equal(overlayManager.hasOpenOverlay(), false);
});

test("overlay manager does not change route state and supports idempotent close", () => {
  resetOverlayManagerForTests();
  overlayManager.openOverlay({ id: "country-picker" });
  assert.equal(overlayManager.closeOverlay("country-picker"), true);
  assert.equal(overlayManager.closeOverlay("country-picker"), false);
  assert.equal(overlayManager.getTopOverlay(), null);
});

test("overlay manager prevents duplicate entries for an id", () => {
  resetOverlayManagerForTests();
  overlayManager.openOverlay({ id: "choice-category" });
  overlayManager.openOverlay({ id: "choice-category" });
  assert.equal(overlayManager.size, 1);
  resetOverlayManagerForTests();
});
