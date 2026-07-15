import { DB_NAME, MIGRATIONS, REQUIRED_TABLES, SCHEMA_VERSION } from "./schema.mjs";

let connectionPromise;

function pluginExports() {
  return globalThis.capacitorCapacitorSQLite || {};
}

export function databaseUnavailableMessage() {
  return "本地数据库无法打开。请关闭并重新启动 App；数据不会被自动清空。";
}

async function migrate(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`, true);
  const result = await db.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1");
  let currentVersion = Number(result.values?.[0]?.version || 0);
  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(`本地数据库版本 ${currentVersion} 高于当前 App 支持的版本 ${SCHEMA_VERSION}`);
  }
  for (const migration of MIGRATIONS.filter((item) => item.version > currentVersion)) {
    await db.beginTransaction();
    try {
      await db.execute(migration.statements.join(";\n"), false);
      await db.run(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        [migration.version, new Date().toISOString()],
        false,
      );
      await db.commitTransaction();
      currentVersion = migration.version;
    } catch (error) {
      await db.rollbackTransaction().catch(() => undefined);
      throw new Error(`本地数据库迁移 ${migration.version} 失败：${error?.message || error}`);
    }
  }
  if (currentVersion !== SCHEMA_VERSION) {
    throw new Error(`本地数据库版本未完成：${currentVersion}/${SCHEMA_VERSION}`);
  }
  const tables = await db.query("SELECT name FROM sqlite_master WHERE type = 'table'");
  const names = new Set((tables.values || []).map((row) => row.name));
  const missing = REQUIRED_TABLES.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`本地数据库缺少表：${missing.join(", ")}`);
  return currentVersion;
}

async function openDatabase() {
  const exports = pluginExports();
  const plugin = exports.CapacitorSQLite;
  const Connection = exports.SQLiteConnection;
  if (!plugin || !Connection) throw new Error(databaseUnavailableMessage());
  const sqlite = new Connection(plugin);
  const db = await sqlite.createConnection(DB_NAME, false, "no-encryption", SCHEMA_VERSION, false);
  await db.open();
  const schemaVersion = await migrate(db);
  return { db, sqlite, schemaVersion };
}

export function initializeDatabase() {
  if (!connectionPromise) {
    connectionPromise = openDatabase().catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  return connectionPromise;
}

export async function withTransaction(callback) {
  const { db } = await initializeDatabase();
  await db.beginTransaction();
  try {
    const result = await callback(db);
    await db.commitTransaction();
    return result;
  } catch (error) {
    await db.rollbackTransaction().catch(() => undefined);
    throw error;
  }
}

export { DB_NAME, SCHEMA_VERSION };
