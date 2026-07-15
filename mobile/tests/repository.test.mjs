import assert from "node:assert/strict";
import test from "node:test";
import { REQUIRED_TABLES } from "../web/assets/schema.mjs";

class FakeDatabase {
  constructor() {
    this.rows = [];
    this.queries = [];
    this.transactions = 0;
  }
  async open() {}
  async beginTransaction() { this.transactions += 1; }
  async commitTransaction() { this.transactions -= 1; }
  async rollbackTransaction() { this.transactions = Math.max(0, this.transactions - 1); }
  async execute(statement) { this.queries.push(statement); }
  async query(statement, values = []) {
    this.queries.push({ statement, values });
    if (statement.includes("SELECT version FROM schema_migrations")) return { values: [] };
    if (statement.includes("SELECT name FROM sqlite_master")) return { values: REQUIRED_TABLES.map((name) => ({ name })) };
    if (statement.includes("SELECT * FROM beers WHERE id")) return { values: this.rows.filter((row) => row.id === values[0]) };
    return { values: this.rows.filter((row) => row.deleted_at === null) };
  }
  async run(statement, values = []) {
    this.queries.push({ statement, values });
    if (statement.startsWith("INSERT INTO schema_migrations")) return {};
    if (statement.startsWith("INSERT INTO beers")) {
      const [id, name, brand, brewery, countryCode, countryName, style, category, abv, plato, volume, note, overall, mouthfeel, bitterness, complexity, createdAt, updatedAt] = values;
      this.rows.push({ id, name, brand, brewery, country_code: countryCode, country_name: countryName, style, category, abv_scaled: abv, plato_scaled: plato, default_volume_ml: volume, personal_note: note, overall_rating_scaled: overall, mouthfeel_rating: mouthfeel, bitterness_rating: bitterness, complexity_rating: complexity, created_at: createdAt, updated_at: updatedAt, deleted_at: null, sync_status: "local", revision: 1 });
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
globalThis.capacitorCapacitorSQLite = {
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async createConnection() { connectionCount += 1; return fakeDb; }
  },
};

const { initializeDatabase } = await import("../web/assets/database.js");
const { beerRepository } = await import("../web/assets/beer-repository.js");

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
  assert.ok(fakeDb.queries.some((item) => typeof item === "object" && item.statement.includes("LIKE") && item.values.includes("%测试%")));
  assert.ok(fakeDb.queries.some((item) => typeof item === "object" && item.statement.includes("category = ?") && item.values.includes("拉格")));
});
