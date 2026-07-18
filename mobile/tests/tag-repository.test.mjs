import assert from "node:assert/strict";
import test from "node:test";
import { REQUIRED_TABLES } from "../web/assets/schema.mjs";

class TagDb {
  constructor() { this.tags = []; this.links = []; this.beers = [{ id: "beer-1", deleted_at: null }]; this.tx = 0; }
  async isDBOpen() { return { result: true }; }
  async beginTransaction() { this.tx += 1; }
  async commitTransaction() { this.tx -= 1; }
  async rollbackTransaction() { this.tx -= 1; }
  async execute() {}
  async query(sql, values = []) {
    if (sql.includes("SELECT version FROM schema_migrations")) return { values: [{ version: 4 }] };
    if (sql.includes("SELECT name FROM sqlite_master")) return { values: REQUIRED_TABLES.map((name) => ({ name })) };
    if (sql.includes("FROM beer_flavor_tags bft JOIN flavor_tags ft") && sql.includes("bft.beer_id = ?") && sql.includes("link_created_at")) {
      return { values: this.links.filter((link) => link.beer_id === values[0]).map((link) => ({
        beer_id: link.beer_id, tag_id: link.tag_id,
        link_created_at: link.created_at, link_updated_at: link.updated_at,
        link_deleted_at: link.deleted_at, link_sync_status: link.sync_status, link_revision: link.revision,
        ...this.tags.find((tag) => tag.id === link.tag_id),
      })) };
    }
    if (sql.includes("FROM beer_flavor_tags bft JOIN flavor_tags ft") && sql.includes("IN (")) {
      return { values: this.links.filter((link) => values.includes(link.beer_id) && !link.deleted_at).map((link) => ({ beer_id: link.beer_id, ...this.tags.find((tag) => tag.id === link.tag_id) })) };
    }
    if (sql.includes("FROM beer_flavor_tags bft JOIN flavor_tags ft") && sql.includes("bft.beer_id = ?")) {
      return { values: this.links.filter((link) => link.beer_id === values[0] && !link.deleted_at).map((link) => ({ ...this.tags.find((tag) => tag.id === link.tag_id) })) };
    }
    if (sql.includes("normalized_name = ?")) return { values: this.tags.filter((tag) => tag.normalized_name === values[0]) };
    if (sql.includes("ft.id = ?")) return { values: this.tags.filter((tag) => tag.id === values[0] && !tag.deleted_at) };
    if (sql.includes("ft.deleted_at IS NULL") && sql.includes("LIKE")) {
      const needle = values[0].replaceAll("%", ""); return { values: this.tags.filter((tag) => !tag.deleted_at && (tag.name.includes(needle) || tag.normalized_name.includes(needle))) };
    }
    if (sql.includes("GROUP BY ft.id")) return { values: this.tags.filter((tag) => !tag.deleted_at).map((tag) => ({ ...tag, usage_count: this.links.filter((link) => link.tag_id === tag.id && !link.deleted_at).length })) };
    if (sql.includes("ft.deleted_at IS NULL")) return { values: this.tags.filter((tag) => !tag.deleted_at) };
    return { values: [] };
  }
  async run(sql, values = []) {
    if (sql.startsWith("INSERT INTO flavor_tags")) {
      const [id, name, normalized_name, created_at, updated_at] = values;
      this.tags.push({ id, name, normalized_name, category: "custom", created_at, updated_at, deleted_at: null, sync_status: "local", revision: 1 });
    } else if (sql.startsWith("UPDATE flavor_tags")) {
      const tag = this.tags.find((item) => item.id === values.at(-1)); if (tag) { tag.deleted_at = null; tag.updated_at = values[0]; tag.revision += 1; }
    } else if (sql.startsWith("INSERT INTO beer_flavor_tags")) {
      const [beer_id, tag_id, created_at, updated_at] = values; this.links.push({ beer_id, tag_id, created_at, updated_at, deleted_at: null, sync_status: "local", revision: 1 });
    } else if (sql.startsWith("UPDATE beer_flavor_tags")) {
      const link = this.links.find((item) => item.beer_id === values.at(-2) && item.tag_id === values.at(-1)); if (link) { link.deleted_at = sql.includes("deleted_at = NULL") ? null : values[0]; link.revision += 1; }
    }
  }
}

const db = new TagDb();
globalThis.__BEER_JOURNAL_SQLITE_TEST_BRIDGE__ = {
  Capacitor: { getPlatform: () => "test", isNativePlatform: () => false }, CapacitorSQLite: {},
  SQLiteConnection: class { async checkConnectionsConsistency() {} async isConnection() { return { result: true }; } async retrieveConnection() { return db; } },
  SQLiteDBConnection: class {},
};
const { normalizeTagName, splitTagInput, setBeerTagsInTransaction, tagRepository } = await import("../web/assets/tag-repository.js?tag-tests");

test("normalizes and deduplicates Chinese and English tag input", () => {
  assert.equal(normalizeTagName("  Citrus  "), "citrus");
  assert.deepEqual(splitTagInput("柑橘，Citrus\n citrus"), ["柑橘", "Citrus"]);
});

test("creates tags once and sets, removes, and restores Beer links", async () => {
  const first = await tagRepository.createOrGetTag("柑橘");
  const duplicate = await tagRepository.createOrGetTag(" 柑橘 ");
  assert.equal(first.id, duplicate.id);
  await tagRepository.setBeerTags("beer-1", ["柑橘", "松脂"]);
  assert.equal((await tagRepository.listTagsByBeerId("beer-1")).length, 2);
  const pine = (await tagRepository.listTags()).find((tag) => tag.name === "松脂");
  await tagRepository.removeTagFromBeer("beer-1", pine.id);
  assert.equal((await tagRepository.listTagsByBeerId("beer-1")).length, 1);
  await tagRepository.setBeerTags("beer-1", ["柑橘", "松脂"]);
  assert.equal((await tagRepository.listTagsByBeerId("beer-1")).length, 2);
  assert.equal(db.tags.length, 2);
});

test("returns canonical Tag objects when relation rows contain tag_id", async () => {
  const tags = await tagRepository.listTagsByBeerId("beer-1");
  assert.ok(tags.length > 0);
  for (const tag of tags) {
    assert.match(tag.id, /^[0-9a-f-]{36}$/i);
    assert.equal(typeof tag.name, "string");
    assert.equal(typeof tag.normalized_name, "string");
    assert.equal("tag_id" in tag, false);
  }
});

test("edits existing and new tags together, then restores a removed relation", async () => {
  await tagRepository.setBeerTags("beer-1", ["NativeTest", "Malt"]);
  let tags = await tagRepository.listTagsByBeerId("beer-1");
  assert.deepEqual(tags.map((tag) => tag.name).sort(), ["Malt", "NativeTest"]);
  await tagRepository.setBeerTags("beer-1", ["NativeTest", "Malt", "Citrus"]);
  tags = await tagRepository.listTagsByBeerId("beer-1");
  assert.deepEqual(tags.map((tag) => tag.name).sort(), ["Citrus", "Malt", "NativeTest"]);
  assert.equal(new Set(tags.map((tag) => tag.id)).size, tags.length);
});

test("searches tags and returns usage counts", async () => {
  await tagRepository.createOrGetTag("Citrus");
  assert.ok((await tagRepository.listTags()).some((tag) => tag.name === "Citrus"));
  const searchResults = await tagRepository.searchTags("citrus");
  assert.equal(searchResults.length, 1);
  const counts = await tagRepository.listTagUsageCounts();
  assert.equal(counts.find((tag) => tag.name === "NativeTest").usage_count, 1);
});

test("rejects a tag relation before inserting a null tag id", async () => {
  const invalidDb = {
    async query(sql) {
      if (sql.includes("normalized_name")) return { values: [{ name: "Broken", normalized_name: "broken" }] };
      if (sql.includes("WHERE id")) return { values: [] };
      return { values: [] };
    },
    async run() { throw new Error("relation INSERT must not run"); },
  };
  await assert.rejects(
    () => setBeerTagsInTransaction(invalidDb, "beer-1", ["Broken"]),
    (error) => error.code === "TAG_CONTRACT_INVALID" && /setBeerTagsInTransaction/.test(error.details),
  );
});
