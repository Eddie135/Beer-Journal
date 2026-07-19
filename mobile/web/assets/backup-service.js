import { initializeDatabase, withTransaction, SCHEMA_VERSION, DB_NAME } from "./database.js";
import { photoRepository } from "./photo-repository.js";
import { Filesystem } from "@capacitor/filesystem";

const BACKUP_VERSION = 1;
const TABLES = ["beers", "beer_categories", "beer_styles", "flavor_tags", "beer_flavor_tags", "tastings", "photos", "settings"];
const now = () => new Date().toISOString();

function fs() { const plugin = Filesystem || globalThis.Capacitor?.Plugins?.Filesystem; if (!plugin) throw new Error("本地文件系统插件未加载"); return plugin; }
function base64Json(value) { return btoa(unescape(encodeURIComponent(JSON.stringify(value)))); }
function parseJson(value) { return JSON.parse(decodeURIComponent(escape(atob(value)))); }

export class BackupService {
  async exportBackup() {
    const { db } = await initializeDatabase();
    const tables = {};
    for (const table of TABLES) {
      const result = await db.query(`SELECT * FROM ${table}`);
      tables[table] = result.values || [];
    }
    const photos = [];
    for (const row of tables.photos || []) {
      if (!row.local_path || row.deleted_at) continue;
      try {
        const original = await photoRepository.readDataUrl(row.local_path);
        const thumbnail = row.thumbnail_path ? await photoRepository.readDataUrl(row.thumbnail_path) : "";
        photos.push({ id: row.id, original, thumbnail });
      } catch { /* missing files are recorded by metadata and skipped */ }
    }
    return {
      format: "beer-journal-backup",
      version: BACKUP_VERSION,
      schema_version: SCHEMA_VERSION,
      database: DB_NAME,
      exported_at: now(),
      tables,
      files: photos,
    };
  }

  async downloadBackup() {
    const backup = await this.exportBackup();
    const json = JSON.stringify(backup);
    const filename = `beer-journal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (globalThis.Capacitor?.isNativePlatform?.() || globalThis.Capacitor?.getPlatform?.() === "android") {
      const path = `backups/${filename}`;
      await fs().writeFile({ path, data: base64Json(backup), directory: "DATA", recursive: true });
      return `DATA/${path}`;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }

  async validate(backup) {
    if (!backup || backup.format !== "beer-journal-backup" || backup.version !== BACKUP_VERSION) throw new Error("备份格式或版本不支持");
    if (!backup.tables?.beers || !backup.tables?.tastings || !backup.tables?.photos) throw new Error("备份文件不完整");
    for (const beer of backup.tables.beers) if (!beer.id || !beer.name) throw new Error("备份中的啤酒记录无效");
    for (const tasting of backup.tables.tastings) if (!tasting.id || !tasting.beer_id) throw new Error("备份中的品饮记录无效");
    return true;
  }

  async importBackup(backup) {
    await this.validate(backup);
    const { db } = await initializeDatabase();
    const written = [];
    try {
      for (const file of backup.files || []) {
        const row = backup.tables.photos.find((item) => item.id === file.id);
        if (!row) continue;
        await fs().writeFile({ path: row.local_path, data: file.original.split(",")[1] || file.original, directory: "DATA", recursive: true });
        written.push(row.local_path);
        if (row.thumbnail_path && file.thumbnail) {
          await fs().writeFile({ path: row.thumbnail_path, data: file.thumbnail.split(",")[1] || file.thumbnail, directory: "DATA", recursive: true });
          written.push(row.thumbnail_path);
        }
      }
      await withTransaction(async (transactionDb) => {
        for (const table of TABLES) {
          const rows = backup.tables[table] || [];
          if (!rows.length) continue;
          const columns = Object.keys(rows[0]);
          const placeholders = columns.map(() => "?").join(", ");
          for (const row of rows) {
            await transactionDb.run(`INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`, columns.map((column) => row[column] ?? null), false);
          }
        }
      });
      return true;
    } catch (error) {
      for (const path of written) { try { await fs().deleteFile({ path, directory: "DATA" }); } catch {} }
      throw error;
    }
  }

  async importFile(file) {
    const text = await file.text();
    return this.importBackup(JSON.parse(text));
  }

  async clearAll() {
    const { db } = await initializeDatabase();
    await withTransaction(async (transactionDb) => {
      for (const table of [...TABLES].reverse()) await transactionDb.run(`DELETE FROM ${table}`, [], false);
    });
  }
}

export const backupService = new BackupService();
export { BACKUP_VERSION };
