import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRoute,
  parseBeerDetailRoute,
  parseBeerEditRoute,
  readRoute,
  readRouteWithQuery,
} from "../web/assets/route-utils.mjs";

const validBeerId = "123e4567-e89b-12d3-a456-426614174000";

test("normalizes hash, pathname, query, and trailing slash routes", () => {
  assert.equal(normalizeRoute("/beers/new"), "/beers/new");
  assert.equal(normalizeRoute("/beers/new/"), "/beers/new");
  assert.equal(normalizeRoute("#/beers/new"), "/beers/new");
  assert.equal(normalizeRoute("#/beers/new/?source=button"), "/beers/new");
  assert.equal(readRoute({ hash: "#/beers/new/", pathname: "/" }), "/beers/new");
  assert.equal(readRoute({ hash: "", pathname: "/beers/new/?source=button" }), "/beers/new");
  assert.equal(readRouteWithQuery({ hash: "#/tastings/new?beer_id=abc", pathname: "/" }), "/tastings/new?beer_id=abc");
  assert.equal(readRouteWithQuery({ hash: "", pathname: "/tastings/new", search: "?beer_id=abc" }), "/tastings/new?beer_id=abc");
  assert.equal(normalizeRoute(""), "/");
});

test("only valid UUIDs are accepted as Beer detail or edit ids", () => {
  assert.equal(parseBeerDetailRoute(`/beers/${validBeerId}`), validBeerId);
  assert.equal(parseBeerDetailRoute(`/beers/${validBeerId}/`), validBeerId);
  assert.equal(parseBeerEditRoute(`/beers/${validBeerId}/edit`), validBeerId);
  for (const value of ["new", "undefined", "null", "", "not-a-uuid"]) {
    assert.equal(parseBeerDetailRoute(`/beers/${value}`), null);
    assert.equal(parseBeerEditRoute(`/beers/${value}/edit`), null);
  }
});
