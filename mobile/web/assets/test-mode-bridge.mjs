// Test-only in-memory SQLite-compatible adapter. It is loaded only when
// VITE_APP_TEST_MODE=true and is never used by Android or production builds.
const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const patternValue = (value) => String(value ?? "").replace(/^%|%$/g, "").toLowerCase();

const tables = ["schema_migrations", "beers", "beer_categories", "beer_styles", "flavor_tags", "beer_flavor_tags", "tastings", "photos", "settings"];
const beers = [
  {
    id: "11111111-1111-4111-8111-111111111111", remote_id: null, owner_id: null,
    name: "本地拉格示例", brand: "Beer Journal", brewery: "本地酒厂", country_code: "CN", country_name: "中国",
    style: "皮尔森", category: "拉格", abv_scaled: 480, plato_scaled: 1150, default_volume_ml: 330,
    personal_note: "清爽示例", overall_rating_scaled: 82, mouthfeel_rating: 3, bitterness_rating: 2, complexity_rating: 3,
    created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null, sync_status: "local", revision: 1,
  },
  {
    id: "22222222-2222-4222-8222-222222222222", remote_id: null, owner_id: null,
    name: "小麦啤酒示例", brand: "Local Wheat", brewery: "比利时酒厂", country_code: "BE", country_name: "比利时",
    style: "小麦啤酒", category: "艾尔", abv_scaled: 520, plato_scaled: 1250, default_volume_ml: 500,
    personal_note: "果香示例", overall_rating_scaled: 88, mouthfeel_rating: 4, bitterness_rating: 1, complexity_rating: 4,
    created_at: "2026-02-01T00:00:00.000Z", updated_at: "2026-02-01T00:00:00.000Z", deleted_at: null, sync_status: "local", revision: 1,
  },
  {
    id: "33333333-3333-4333-8333-333333333333", remote_id: null, owner_id: null,
    name: "自定义国家示例", brand: "Custom Origin", brewery: "独立酒厂", country_code: "", country_name: "韩国",
    style: "IPA", category: "艾尔", abv_scaled: 650, plato_scaled: 1400, default_volume_ml: 330,
    personal_note: "无标签示例", overall_rating_scaled: null, mouthfeel_rating: null, bitterness_rating: null, complexity_rating: null,
    created_at: "2026-03-01T00:00:00.000Z", updated_at: "2026-03-01T00:00:00.000Z", deleted_at: null, sync_status: "local", revision: 1,
  },
];
const tags = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", remote_id: null, owner_id: null, name: "好喝", normalized_name: "好喝", category: "custom", created_at: now(), updated_at: now(), deleted_at: null, sync_status: "local", revision: 1 },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", remote_id: null, owner_id: null, name: "清爽", normalized_name: "清爽", category: "custom", created_at: now(), updated_at: now(), deleted_at: null, sync_status: "local", revision: 1 },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", remote_id: null, owner_id: null, name: "果香", normalized_name: "果香", category: "custom", created_at: now(), updated_at: now(), deleted_at: null, sync_status: "local", revision: 1 },
];
const links = [
  { beer_id: beers[0].id, tag_id: tags[0].id, created_at: now(), updated_at: now(), deleted_at: null, sync_status: "local", revision: 1 },
  { beer_id: beers[0].id, tag_id: tags[1].id, created_at: now(), updated_at: now(), deleted_at: null, sync_status: "local", revision: 1 },
  { beer_id: beers[1].id, tag_id: tags[2].id, created_at: now(), updated_at: now(), deleted_at: null, sync_status: "local", revision: 1 },
];

class TestDatabase {
  constructor() { this.opened = true; this.schemaVersion = 4; }
  async isDBOpen() { return { result: this.opened }; }
  async open() { this.opened = true; }
  async beginTransaction() {}
  async commitTransaction() {}
  async rollbackTransaction() {}
  async execute() {}
  async query(statement, values = []) {
    const sql = statement.replace(/\s+/g, " ").trim();
    if (sql.includes("SELECT version FROM schema_migrations")) return { values: [{ version: this.schemaVersion }] };
    if (sql.includes("SELECT name FROM sqlite_master")) return { values: tables.map((name) => ({ name })) };
    if (sql.startsWith("PRAGMA table_info")) return { values: [] };
    if (sql.includes("normalized_name = ?")) return { values: tags.filter((tag) => tag.normalized_name === values[0]).map(clone) };
    if (sql.includes("ft.id = ?")) return { values: tags.filter((tag) => tag.id === values[0] && !tag.deleted_at).map(clone) };
    if (sql.includes("ft.deleted_at IS NULL AND") && sql.includes("LIKE")) {
      const needle = patternValue(values[0]);
      return { values: tags.filter((tag) => !tag.deleted_at && (tag.name.toLowerCase().includes(needle) || tag.normalized_name.includes(needle))).map(clone) };
    }
    if (sql.includes("COUNT(DISTINCT bft.beer_id)")) {
      return { values: tags.filter((tag) => !tag.deleted_at).map((tag) => ({ ...clone(tag), usage_count: links.filter((link) => link.tag_id === tag.id && !link.deleted_at).length })) };
    }
    if (sql.includes("link_created_at")) {
      return { values: links.filter((link) => link.beer_id === values[0]).map((link) => ({
        beer_id: link.beer_id, tag_id: link.tag_id,
        link_created_at: link.created_at, link_updated_at: link.updated_at,
        link_deleted_at: link.deleted_at, link_sync_status: link.sync_status, link_revision: link.revision,
        ...clone(tags.find((tag) => tag.id === link.tag_id)),
      })) };
    }
    if (sql.includes("bft.beer_id AS beer_id") && sql.includes("IN (")) {
      const ids = values;
      return { values: links.filter((link) => ids.includes(link.beer_id) && !link.deleted_at).map((link) => ({ ...clone(link), ...clone(tags.find((tag) => tag.id === link.tag_id)) })) };
    }
    if (sql.includes("SELECT ft.id AS id FROM beer_flavor_tags")) {
      return { values: links.filter((link) => link.beer_id === values[0] && !link.deleted_at).map((link) => clone(tags.find((tag) => tag.id === link.tag_id))).filter(Boolean) };
    }
    if (sql.includes("ft.deleted_at IS NULL")) return { values: tags.filter((tag) => !tag.deleted_at).map(clone) };
    if (sql.includes("SELECT id FROM beers WHERE id")) return { values: beers.filter((beer) => beer.id === values[0] && !beer.deleted_at).map((beer) => ({ id: beer.id })) };
    if (sql.includes("FROM tastings t JOIN beers") || sql.includes("FROM tastings WHERE")) return { values: [] };
    if (sql.includes("FROM beers WHERE id")) return { values: beers.filter((beer) => beer.id === values[0]).map(clone) };
    if (sql.includes("FROM beers WHERE")) {
      let result = beers.filter((beer) => !beer.deleted_at);
      let index = 0;
      if (sql.includes("name LIKE")) {
        const needle = patternValue(values[0]);
        result = result.filter((beer) => [beer.name, beer.brand, beer.brewery, beer.country_name, beer.style, beer.category].some((field) => field.toLowerCase().includes(needle)) || links.some((link) => link.beer_id === beer.id && !link.deleted_at && tags.find((tag) => tag.id === link.tag_id)?.name.toLowerCase().includes(needle)));
        index = 8;
      }
      if (sql.includes("category = ?")) { const category = values[index]; result = result.filter((beer) => beer.category === category); index += 1; }
      if (sql.includes("country_code = ?")) { const code = values[index]; result = result.filter((beer) => beer.country_code === code); index += 1; }
      else if (sql.includes("LOWER(country_name) = LOWER(?)")) { const country = String(values[index]).toLowerCase(); result = result.filter((beer) => beer.country_name.toLowerCase() === country); index += 1; }
      if (sql.includes("overall_rating_scaled >= ?")) { const min = Number(values[index]); result = result.filter((beer) => beer.overall_rating_scaled !== null && beer.overall_rating_scaled >= min); index += 1; }
      if (sql.includes("overall_rating_scaled <= ?")) { const max = Number(values[index]); result = result.filter((beer) => beer.overall_rating_scaled !== null && beer.overall_rating_scaled <= max); index += 1; }
      const tagIds = values.slice(index).filter((value) => typeof value === "string" && /^[a-f0-9-]{8,}$/.test(value));
      if (tagIds.length) result = result.filter((beer) => tagIds.every((tagId) => links.some((link) => link.beer_id === beer.id && link.tag_id === tagId && !link.deleted_at)));
      return { values: result.sort((a, b) => a.name.localeCompare(b.name)).map(clone) };
    }
    return { values: [] };
  }
  async run(statement, values = []) {
    const sql = statement.replace(/\s+/g, " ").trim();
    if (sql.startsWith("INSERT INTO flavor_tags")) {
      const [id, name, normalized_name, created_at, updated_at] = values;
      tags.push({ id, remote_id: null, owner_id: null, name, normalized_name, category: "custom", created_at, updated_at, deleted_at: null, sync_status: "local", revision: 1 });
    } else if (sql.startsWith("INSERT INTO beer_flavor_tags")) {
      const [beer_id, tag_id, created_at, updated_at] = values;
      links.push({ beer_id, tag_id, created_at, updated_at, deleted_at: null, sync_status: "local", revision: 1 });
    } else if (sql.startsWith("UPDATE beer_flavor_tags")) {
      const beerId = values.at(-2); const tagId = values.at(-1); const link = links.find((item) => item.beer_id === beerId && item.tag_id === tagId);
      if (link) { link.deleted_at = sql.includes("deleted_at = NULL") ? null : values[0]; link.revision += 1; link.updated_at = values[1] || values[0]; }
    } else if (sql.startsWith("INSERT INTO beers")) {
      const [id, name, brand, brewery, country_code, country_name, style, category, abv_scaled, plato_scaled, default_volume_ml, personal_note, overall_rating_scaled, mouthfeel_rating, bitterness_rating, complexity_rating, created_at, updated_at] = values;
      beers.push({ id, remote_id: null, owner_id: null, name, brand, brewery, country_code, country_name, style, category, abv_scaled, plato_scaled, default_volume_ml, personal_note, overall_rating_scaled, mouthfeel_rating, bitterness_rating, complexity_rating, created_at, updated_at, deleted_at: null, sync_status: "local", revision: 1 });
    } else if (sql.startsWith("UPDATE beers SET")) {
      const beer = beers.find((item) => item.id === values.at(-1));
      if (beer) { beer.name = values[0]; beer.brand = values[1]; beer.brewery = values[2]; beer.country_code = values[3]; beer.country_name = values[4]; beer.style = values[5]; beer.category = values[6]; beer.abv_scaled = values[7]; beer.plato_scaled = values[8]; beer.default_volume_ml = values[9]; beer.personal_note = values[10]; beer.overall_rating_scaled = values[11]; beer.mouthfeel_rating = values[12]; beer.bitterness_rating = values[13]; beer.complexity_rating = values[14]; beer.updated_at = values[15]; beer.revision += 1; }
    }
  }
}

const database = new TestDatabase();
const bridge = {
  Capacitor: { getPlatform: () => "web-test", isNativePlatform: () => false, isPluginAvailable: () => true },
  CapacitorSQLite: {},
  SQLiteDBConnection: class {},
  SQLiteConnection: class {
    async checkConnectionsConsistency() { return { result: true }; }
    async isConnection() { return { result: false }; }
    async createConnection() { return database; }
  },
};
globalThis.__BEER_JOURNAL_SQLITE_TEST_BRIDGE__ = bridge;
