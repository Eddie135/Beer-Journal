import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";
import { DB_NAME, MIGRATIONS, REQUIRED_TABLES, SCHEMA_VERSION } from "./schema.mjs";

let connectionPromise;
let diagnostics = {
  stage: "not_started",
  database: DB_NAME,
  currentVersion: "unknown",
  targetVersion: SCHEMA_VERSION,
  connection: "not_created",
  open: false,
  platform: "unknown",
  nativePlatform: false,
  plugin: false,
  pluginAvailable: "unknown",
  migration: "",
  error: "",
};

function sqliteBridge() {
  // This adapter is used only by the Node repository tests. Android always
  // uses the npm-imported Capacitor bridge below.
  return globalThis.__BEER_JOURNAL_SQLITE_TEST_BRIDGE__ || {
    Capacitor,
    CapacitorSQLite,
    SQLiteConnection,
    SQLiteDBConnection,
  };
}
function setDiagnostic(values = {}) { diagnostics = { ...diagnostics, ...values, database: DB_NAME, targetVersion: SCHEMA_VERSION }; }
export function getDatabaseDiagnostics() { return { ...diagnostics }; }

export function databaseUnavailableMessage() {
  const detail = diagnostics.error
    ? `\n\nDebug details:\nStage: ${diagnostics.stage}\nPlatform: ${diagnostics.platform}\nNative platform: ${diagnostics.nativePlatform ? "yes" : "no"}\nSQLite proxy: ${diagnostics.plugin ? "yes" : "no"}\nNative plugin registered: ${diagnostics.pluginAvailable}\nDatabase: ${diagnostics.database}\nCurrent schema: ${diagnostics.currentVersion}\nTarget schema: ${diagnostics.targetVersion}\nConnection: ${diagnostics.connection}\nOpen: ${diagnostics.open ? "yes" : "no"}\nCause: ${diagnostics.error}`
    : "";
  return `Local database is unavailable. No data was deleted.${detail}`;
}

function rawError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}
function fail(stage, error) {
  const message = rawError(error);
  setDiagnostic({ stage, error: message });
  console.error("Beer Journal database initialization failed", { ...diagnostics });
  throw error instanceof Error ? error : new Error(message);
}

function isMissingConnectionError(error) {
  const message = rawError(error).toLowerCase();
  return message.includes("no available connection")
    || /connection .* does not exist/.test(message);
}

async function migrationStatements(db, migration) {
  if (migration.version !== 2) return migration.statements;
  try {
    const result = await db.query("PRAGMA table_info(tastings)");
    const columns = new Set((result.values || []).map((row) => row.name).filter(Boolean));
    return migration.statements.filter((statement) => {
      const match = statement.match(/^ALTER TABLE tastings ADD COLUMN ([a-z_]+)/i);
      return !match || !columns.has(match[1]);
    });
  } catch {
    return migration.statements;
  }
}

async function migrate(db) {
  setDiagnostic({ stage: "schema_read", connection: "retrieved_or_created", open: true, migration: "", error: "" });
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    )`, true);
    const result = await db.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1");
    let currentVersion = Number(result.values?.[0]?.version || 0);
    setDiagnostic({ currentVersion });
    if (currentVersion > SCHEMA_VERSION) throw new Error(`Database schema ${currentVersion} is newer than supported schema ${SCHEMA_VERSION}`);
    for (const migration of MIGRATIONS.filter((item) => item.version > currentVersion)) {
      setDiagnostic({ stage: "migration", migration: `${currentVersion} -> ${migration.version}` });
      await db.beginTransaction();
      try {
        const statements = await migrationStatements(db, migration);
        if (statements.length) await db.execute(statements.join(";\n"), false);
        await db.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [migration.version, new Date().toISOString()], false);
        await db.commitTransaction();
        currentVersion = migration.version;
        setDiagnostic({ currentVersion });
      } catch (error) {
        await db.rollbackTransaction().catch(() => undefined);
        throw error;
      }
    }
    if (currentVersion !== SCHEMA_VERSION) throw new Error(`Database migration incomplete: ${currentVersion}/${SCHEMA_VERSION}`);
    setDiagnostic({ stage: "schema_read" });
    const tables = await db.query("SELECT name FROM sqlite_master WHERE type = 'table'");
    const names = new Set((tables.values || []).map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((name) => !names.has(name));
    if (missing.length) throw new Error(`Database is missing tables: ${missing.join(", ")}`);
    setDiagnostic({ stage: "ready", currentVersion, connection: "ready", open: true, error: "" });
    return currentVersion;
  } catch (error) {
    fail(diagnostics.stage, error);
  }
}

async function openDatabase() {
  setDiagnostic({ stage: "plugin_lookup", error: "", connection: "not_created", open: false });
  const exports = sqliteBridge();
  const plugin = exports.CapacitorSQLite;
  const Connection = exports.SQLiteConnection;
  const DBConnection = exports.SQLiteDBConnection;
  const platform = exports.Capacitor?.getPlatform?.() || "unknown";
  const native = exports.Capacitor?.isNativePlatform?.() ?? false;
  const pluginAvailable = exports.Capacitor?.isPluginAvailable?.("CapacitorSQLite");
  setDiagnostic({ platform, nativePlatform: native, plugin: Boolean(plugin), pluginAvailable: pluginAvailable ?? "unknown" });
  if (!exports.Capacitor) fail("runtime_lookup", new Error("Capacitor runtime is not loaded"));
  if (native && pluginAvailable === false) fail("native_plugin_registration", new Error("CapacitorSQLite native plugin is not registered"));
  if (!plugin || !Connection || !DBConnection) fail("plugin_lookup", new Error("Capacitor SQLite native bridge is not loaded"));
  const sqlite = new Connection(plugin);
  let db;
  try {
    setDiagnostic({ stage: "connection_consistency" });
    try {
      await sqlite.checkConnectionsConsistency();
    } catch (error) {
      // An empty connection registry is normal on first launch. Continue to
      // isConnection so the normal createConnection path can run.
      if (!isMissingConnectionError(error)) throw error;
    }
    setDiagnostic({ stage: "connection_lookup" });
    const connectionResult = await sqlite.isConnection(DB_NAME, false);
    if (connectionResult?.result) {
      setDiagnostic({ stage: "connection_retrieve" });
      db = await sqlite.retrieveConnection(DB_NAME, false);
      setDiagnostic({ connection: "retrieved_from_js_connection" });
    } else {
      setDiagnostic({ stage: "connection_create" });
      db = await sqlite.createConnection(DB_NAME, false, "no-encryption", SCHEMA_VERSION, false);
      setDiagnostic({ connection: "created" });
    }
  } catch (error) {
    fail(diagnostics.stage, error);
  }
  try {
    setDiagnostic({ stage: "database_open_check" });
    const openResult = await db.isDBOpen();
    if (!openResult?.result) {
      setDiagnostic({ stage: "database_open" });
      await db.open();
    }
    setDiagnostic({ open: true });
  } catch (error) {
    fail(diagnostics.stage, error);
  }
  const schemaVersion = await migrate(db);
  return { db, sqlite, schemaVersion };
}

export function initializeDatabase() {
  if (!connectionPromise) {
    connectionPromise = openDatabase().catch((error) => { connectionPromise = undefined; throw error; });
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
