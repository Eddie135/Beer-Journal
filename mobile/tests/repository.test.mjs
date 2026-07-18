import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { REQUIRED_TABLES } from "../web/assets/schema.mjs";

class FakeDatabase {
  constructor() {
    this.rows = [];
    this.tastings = [];
    this.queries = [];
    this.transactions = 0;
  }
  async isDBOpen() { return { result: true }; }
  async open() {}
  async beginTransaction() { this.transactions += 1; }
  async commitTransaction() { this.transactions -= 1; }
  async rollbackTransaction() { this.transactions = Math.max(0, this.transactions - 1); }
  async execute(statement) { this.queries.push(statement); }
  async query(statement, values = []) {
    this.queries.push({ statement, values });
    if (statement.includes("SELECT version FROM schema_migrations")) return { values: [] };
    if (statement.includes("SELECT name FROM sqlite_master")) return { values: REQUIRED_TABLES.map((name) => ({ name })) };
    if (statement.includes("SELECT id FROM beers WHERE id")) return { values: this.rows.filter((row) => row.id === values[0] && row.deleted_at === null).map((row) => ({ id: row.id })) };
    if (statement.includes("FROM tastings t JOIN beers") && statement.includes("WHERE t.id")) {
      const row = this.tastings.find((item) => item.id === values[0]);
      return { values: row ? [{ ...row, beer_name: this.rows.find((beer) => beer.id === row.beer_id)?.name || "" }] : [] };
    }
    if (statement.includes("FROM tastings t JOIN beers") && !statement.includes("COUNT(*)")) {
      const query = values.find((value) => typeof value === "string" && value.startsWith("%"));
      const beerId = values.find((value) => this.rows.some((beer) => beer.id === value));
      return { values: this.tastings.filter((item) => item.deleted_at === null && (!beerId || item.beer_id === beerId) && (!query || item.note.includes(query.replaceAll("%", "")))) };
    }
    if (statement.includes("FROM tastings WHERE beer_id")) {
      const active = this.tastings.filter((item) => item.beer_id === values[0] && item.deleted_at === null);
      return { values: [{ tasting_count: active.length, bottle_count: active.reduce((sum, item) => sum + item.bottle_count, 0), latest_consumed_at: active.map((item) => item.consumed_at).sort().at(-1) || null, average_rating_scaled: active.length ? active.reduce((sum, item) => sum + (item.rating_scaled || 0), 0) / active.length : null }] };
    }
    if (statement.includes("FROM tastings t JOIN beers b") && statement.includes("COUNT(*)")) {
      const active = this.tastings.filter((item) => item.deleted_at === null);
      return { values: [{ tasting_count: active.length, bottle_count: active.reduce((sum, item) => sum + item.bottle_count, 0), average_rating_scaled: active.length ? active.reduce((sum, item) => sum + (item.rating_scaled || 0), 0) / active.length : null }] };
    }
    if (statement.includes("FROM beer_flavor_tags")) return { values: [] };
    if (statement.includes("SELECT * FROM beers WHERE id")) return { values: this.rows.filter((row) => row.id === values[0]) };
    return { values: this.rows.filter((row) => row.deleted_at === null) };
  }
  async run(statement, values = []) {
    this.queries.push({ statement, values });
    if (statement.startsWith("INSERT INTO schema_migrations")) return {};
    if (statement.startsWith("INSERT INTO beers")) {
      const [id, name, brand, brewery, countryCode, countryName, style, category, abv, plato, volume, note, overall, mouthfeel, bitterness, complexity, createdAt, updatedAt] = values;
      this.rows.push({ id, name, brand, brewery, country_code: countryCode, country_name: countryName, style, category, abv_scaled: abv, plato_scaled: plato, default_volume_ml: volume, personal_note: note, overall_rating_scaled: overall, mouthfeel_rating: mouthfeel, bitterness_rating: bitterness, complexity_rating: complexity, created_at: createdAt, updated_at: updatedAt, deleted_at: null, sync_status: "local", revision: 1 });
    } else if (statement.startsWith("INSERT INTO tastings")) {
      const [id, beer_id, tasted_at, drinking_location, capacity_ml, bottle_count_scaled, purchase_channel, price_minor, overall_rating_scaled, notes, consumed_at, location, volume_ml, bottle_count, price_scaled, rating_scaled, note, created_at, updated_at] = values;
      this.tastings.push({ id, beer_id, tasted_at, drinking_location, capacity_ml, bottle_count_scaled, purchase_channel, price_minor, overall_rating_scaled, notes, consumed_at, location, volume_ml, bottle_count, price_scaled, rating_scaled, note, created_at, updated_at, deleted_at: null, sync_status: "local", revision: 1 });
    } else if (statement.startsWith("UPDATE tastings SET")) {
      const id = values[values.length - 1];
      const row = this.tastings.find((item) => item.id === id);
      if (row && statement.includes("deleted_at = ?")) { row.deleted_at = values[0]; row.updated_at = values[1]; row.sync_status = "pending_delete"; row.revision += 1; }
      else if (row) {
        [row.beer_id, row.tasted_at, row.drinking_location, row.capacity_ml, row.bottle_count_scaled, row.purchase_channel, row.price_minor, row.overall_rating_scaled, row.notes, row.consumed_at, row.location, row.volume_ml, row.bottle_count, row.price_scaled, row.rating_scaled, row.note, row.updated_at] = values.slice(0, -1);
        row.revision += 1; row.sync_status = "pending_update";
      }
    } else if (statement.startsWith("UPDATE beers SET") && statement.includes("deleted_at IS NULL")) {
      const id = values[values.length - 1];
      const row = this.rows.find((item) => item.id === id);
      if (row && statement.includes("deleted_at = ?")) {
        row.deleted_at = values[0]; row.updated_at = values[1]; row.sync_status = "pending_delete"; row.revision += 1;
      } else if (row) {
        [row.name, row.brand, row.brewery, row.country_code, row.country_name, row.style, row.category, row.abv_scaled, row.plato_scaled, row.default_volume_ml, row.personal_note, row.overall_rating_scaled, row.mouthfeel_rating, row.bitterness_rating, row.complexity_rating, row.updated_at] = values.slice(0, -1);
        row.sync_status = "pending_update"; row.revision += 1;
      }
    }
    return {};
  }
}

const fakeDb = new FakeDatabase();
let connectionCount = 0;
globalThis.__BEER_JOURNAL_SQLITE_TEST_BRIDGE__ = {
  Capacitor: { getPlatform: () => "test", isNativePlatform: () => false },
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async checkConnectionsConsistency() { return { result: true }; }
    async isConnection() { return { result: false }; }
    async createConnection() { connectionCount += 1; return fakeDb; }
  },
  SQLiteDBConnection: class {},
};

const { initializeDatabase } = await import("../web/assets/database.js");
const { beerRepository } = await import("../web/assets/beer-repository.js");
const { tastingRepository } = await import("../web/assets/tasting-repository.js");

test("database initialization is idempotent and migration runs once", async () => {
  await initializeDatabase();
  await initializeDatabase();
  assert.equal(connectionCount, 1);
  assert.equal(fakeDb.transactions, 0);
});

test("Beer create/read uses UUID and scales numeric values", async () => {
  const first = await beerRepository.createBeer({ name: "本地测试啤酒", abv: "5.2", plato: "12.5", overall_rating: "8.5", mouthfeel_rating: "4", country_code: "DE", country_name: "德国" });
  const second = await beerRepository.createBeer({ name: "第二款啤酒" });
  assert.notEqual(first.id, second.id);
  assert.equal(first.abv_scaled, 520);
  assert.equal(first.plato_scaled, 1250);
  assert.equal(first.overall_rating_scaled, 85);
  assert.equal((await beerRepository.getBeerById(first.id)).name, "本地测试啤酒");
});

test("Beer update increments revision and soft delete hides the record", async () => {
  const beer = (await beerRepository.listBeers())[0];
  const updated = await beerRepository.updateBeer(beer.id, { ...beer, name: "修改后的啤酒" });
  assert.equal(updated.name, "修改后的啤酒");
  assert.equal(updated.revision, 2);
  await beerRepository.softDeleteBeer(beer.id);
  assert.equal((await beerRepository.listBeers()).some((item) => item.id === beer.id), false);
});

test("search and filter are delegated to SQL query parameters", async () => {
  await beerRepository.searchBeers("测试");
  await beerRepository.filterBeers({ category: "拉格", country_code: "DE", min_rating: "7" });
  await beerRepository.filterBeers({ country_name: "Scotland" });
  assert.ok(fakeDb.queries.some((item) => typeof item === "object" && item.statement.includes("LIKE") && item.values.includes("%测试%")));
  assert.ok(fakeDb.queries.some((item) => typeof item === "object" && item.statement.includes("category = ?") && item.values.includes("拉格")));
  assert.ok(fakeDb.queries.some((item) => typeof item === "object" && item.statement.includes("LOWER(country_name) = LOWER(?)") && item.values.includes("Scotland")));
});

test("Tasting create/read/update keeps Beer relation and scaled values", async () => {
  const beer = (await beerRepository.listBeers())[0];
  const tasting = await tastingRepository.createTasting({ beer_id: beer.id, consumed_at: "2026-07-15T12:00:00.000Z", location: "家里", volume_ml: "330", bottle_count: "2", price: "18.50", rating: "8.5", note: "果香明显" });
  assert.ok(tasting.id);
  assert.equal(tasting.beer_id, beer.id);
  assert.equal(tasting.volume_ml, 330);
  assert.equal(tasting.bottle_count, 2);
  assert.equal(tasting.price, "18.50");
  assert.equal(tasting.rating, "8.5");
  await tastingRepository.searchTastings("果香");
  await tastingRepository.filterTastings({ beer_id: beer.id, min_rating: "8" });
  assert.ok(fakeDb.queries.some((item) => typeof item === "object" && item.statement.includes("t.note LIKE") && item.values.includes("%果香%")));
  const updated = await tastingRepository.updateTasting(tasting.id, { ...tasting, beer_id: beer.id, volume_ml: 500, bottle_count: 1, rating: 9, note: "更新笔记" });
  assert.equal(updated.volume_ml, 500);
  assert.equal(updated.revision, 2);
  assert.equal((await tastingRepository.listTastingsByBeerId(beer.id)).length, 1);
});

test("Tasting soft delete and statistics exclude deleted rows", async () => {
  const beer = (await beerRepository.listBeers())[0];
  const tasting = await tastingRepository.createTasting({ beer_id: beer.id, bottle_count: 1, rating: 7 });
  await tastingRepository.softDeleteTasting(tasting.id);
  assert.equal((await tastingRepository.listTastingsByBeerId(beer.id)).some((item) => item.id === tasting.id), false);
  const stats = await tastingRepository.getStatsByBeerId(beer.id);
  assert.equal(stats.tasting_count, 1);
  assert.equal(stats.bottle_count, 1);
});

test("Tasting requires a Beer and does not create an empty record", async () => {
  await assert.rejects(() => tastingRepository.createTasting({ bottle_count: 1 }), /请选择关联啤酒/);
  assert.equal(fakeDb.tastings.length, 2);
});

let initTestId = 0;
function createInitializationHarness({ existing = false, open = false, failFirstOpen = false, consistencyError = false, createDelay = 0 } = {}) {
  const events = [];
  let createCount = 0;
  let currentOpen = open;
  let shouldFailOpen = failFirstOpen;
  const db = {
    async isDBOpen() {
      events.push("db.isDBOpen");
      return { result: currentOpen };
    },
    async open() {
      events.push("db.open");
      if (shouldFailOpen) {
        shouldFailOpen = false;
        throw new Error("test open failure");
      }
      currentOpen = true;
    },
    async execute() { events.push("db.execute"); },
    async beginTransaction() { events.push("db.beginTransaction"); },
    async commitTransaction() { events.push("db.commitTransaction"); },
    async rollbackTransaction() { events.push("db.rollbackTransaction"); },
    async run() { events.push("db.run"); },
    async query(statement) {
      events.push(`db.query:${statement.slice(0, 30)}`);
      if (statement.includes("SELECT version FROM schema_migrations")) return { values: [{ version: 2 }] };
      if (statement.includes("SELECT name FROM sqlite_master")) return { values: REQUIRED_TABLES.map((name) => ({ name })) };
      return { values: [] };
    },
  };
  const bridge = {
    Capacitor: { getPlatform: () => "test", isNativePlatform: () => false, isPluginAvailable: () => true },
    CapacitorSQLite: {
      isDBOpen() {
        events.push("plugin.isDBOpen");
        throw new Error("plugin-level isDBOpen must not be called");
      },
    },
    SQLiteConnection: class {
      async checkConnectionsConsistency() {
        events.push("checkConnectionsConsistency");
        if (consistencyError) throw new Error("No available connection for database beer_journal");
        return { result: true };
      }
      async isConnection() { events.push("isConnection"); return { result: existing }; }
      async retrieveConnection() { events.push("retrieveConnection"); return db; }
      async createConnection() {
        events.push("createConnection");
        createCount += 1;
        if (createDelay) await new Promise((resolve) => setTimeout(resolve, createDelay));
        return db;
      }
    },
    SQLiteDBConnection: class {},
  };
  return {
    events,
    get createCount() { return createCount; },
    async load() {
      globalThis.__BEER_JOURNAL_SQLITE_TEST_BRIDGE__ = bridge;
      initTestId += 1;
      return import(`../web/assets/database.js?connection-order-test=${initTestId}`);
    },
  };
}

test("first initialization creates a connection before checking db open state", async () => {
  const harness = createInitializationHarness({ consistencyError: true });
  const { initializeDatabase: initialize } = await harness.load();
  await initialize();
  assert.equal(harness.createCount, 1);
  assert.equal(harness.events.includes("plugin.isDBOpen"), false);
  assert.ok(harness.events.indexOf("checkConnectionsConsistency") < harness.events.indexOf("isConnection"));
  assert.ok(harness.events.indexOf("isConnection") < harness.events.indexOf("createConnection"));
  assert.ok(harness.events.indexOf("createConnection") < harness.events.indexOf("db.isDBOpen"));
  const schemaRead = harness.events.findIndex((event) => event.startsWith("db.query:SELECT version"));
  assert.ok(harness.events.indexOf("db.isDBOpen") < schemaRead);
});

test("existing connection is retrieved and an already-open database is not opened twice", async () => {
  const harness = createInitializationHarness({ existing: true, open: true });
  const { initializeDatabase: initialize } = await harness.load();
  await initialize();
  assert.ok(harness.events.includes("retrieveConnection"));
  assert.ok(harness.events.includes("db.isDBOpen"));
  assert.equal(harness.events.includes("db.open"), false);
  assert.equal(harness.createCount, 0);
});

test("existing closed connection is opened after retrieval", async () => {
  const harness = createInitializationHarness({ existing: true, open: false });
  const { initializeDatabase: initialize } = await harness.load();
  await initialize();
  assert.ok(harness.events.indexOf("retrieveConnection") < harness.events.indexOf("db.isDBOpen"));
  assert.ok(harness.events.indexOf("db.isDBOpen") < harness.events.indexOf("db.open"));
  assert.equal(harness.createCount, 0);
});

test("concurrent initialization uses one promise and one connection", async () => {
  const harness = createInitializationHarness({ createDelay: 10 });
  const { initializeDatabase: initialize } = await harness.load();
  await Promise.all([initialize(), initialize(), initialize()]);
  assert.equal(harness.createCount, 1);
});

test("initialization failure clears the singleton so a later attempt can retry", async () => {
  const harness = createInitializationHarness({ failFirstOpen: true });
  const { initializeDatabase: initialize } = await harness.load();
  await assert.rejects(() => initialize(), /test open failure/);
  await initialize();
  assert.equal(harness.createCount, 2);
});

test("database migration is reached only after an opened db and never deletes the database", async () => {
  const harness = createInitializationHarness();
  const { initializeDatabase: initialize } = await harness.load();
  await initialize();
  const source = await readFile(new URL("../web/assets/database.js", import.meta.url), "utf8");
  const schemaRead = harness.events.findIndex((event) => event.startsWith("db.query:SELECT version"));
  assert.ok(harness.events.indexOf("db.open") < schemaRead);
  assert.doesNotMatch(source, /deleteDatabase|DROP DATABASE/i);
});
