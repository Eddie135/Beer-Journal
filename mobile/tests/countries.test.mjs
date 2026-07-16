import assert from "node:assert/strict";
import test from "node:test";
import { COUNTRIES, findCountry, flagForCountry, searchCountries } from "../web/assets/countries.js";

test("offline country data covers ISO 3166-1 and distinguishes Korea", () => {
  assert.ok(COUNTRIES.length >= 249, `expected at least 249 countries, got ${COUNTRIES.length}`);
  const south = findCountry("KR");
  const north = findCountry("KP");
  assert.equal(south.name, "韩国");
  assert.equal(south.english, "South Korea");
  assert.equal(north.name, "朝鲜");
  assert.equal(north.english, "North Korea");
  assert.equal(flagForCountry("KR"), "🇰🇷");
});

test("country search matches Chinese, English, aliases, and codes", () => {
  for (const query of ["韩国", "Korea", "South Korea", "Republic of Korea", "KR"]) {
    assert.ok(searchCountries(query).some(([code]) => code === "KR"), query);
  }
  assert.ok(searchCountries("north korea").some(([code]) => code === "KP"));
  assert.ok(searchCountries("de").some(([code]) => code === "DE"));
});

test("custom country display has a globe and no forced ISO code", () => {
  const custom = findCountry("", "苏格兰");
  assert.equal(custom.code, "");
  assert.equal(custom.name, "苏格兰");
  assert.equal(custom.flag, "🌐");
  assert.equal(custom.isCustom, true);
});
