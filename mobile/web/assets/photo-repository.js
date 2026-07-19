import { initializeDatabase, withTransaction } from "./database.js";
import { Filesystem } from "@capacitor/filesystem";
import { Camera } from "@capacitor/camera";

const PHOTO_DIRECTORY = "beer-journal/photos";
const MAX_EDGE = 2048;
const THUMB_EDGE = 480;
const MAX_BYTES = 2_500_000;
const now = () => new Date().toISOString();
const uuid = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0;
  return (c === "x" ? r : (r & 3) | 8).toString(16);
});

function plugins() {
  return { ...(globalThis.Capacitor?.Plugins || {}), Filesystem, Camera };
}

function requireFilesystem() {
  const fs = plugins().Filesystem;
  if (!fs) throw new Error("本地文件系统插件未加载");
  return fs;
}

function dataUrlToBase64(value) {
  const match = String(value).match(/^data:[^;]+;base64,(.*)$/s);
  return match ? match[1] : String(value);
}

async function writeFile(path, data) {
  const fs = requireFilesystem();
  await fs.writeFile({ path, data: dataUrlToBase64(data), directory: "DATA", recursive: true });
}

async function deleteFile(path) {
  try { await requireFilesystem().deleteFile({ path, directory: "DATA" }); } catch { /* already absent */ }
}

async function readFile(path) {
  return requireFilesystem().readFile({ path, directory: "DATA" });
}

function canvasEncode(source, maxEdge, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve({ dataUrl: canvas.toDataURL("image/webp", quality), width: canvas.width, height: canvas.height });
    };
    image.onerror = () => reject(new Error("图片无法解码"));
    image.src = source;
  });
}

async function fileToDataUrl(file) {
  if (typeof file === "string") return file;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function dataUrlBytes(dataUrl) {
  const payload = String(dataUrl).split(",", 2)[1] || "";
  return Math.ceil((payload.length * 3) / 4);
}

async function compressForStorage(source) {
  let edge = MAX_EDGE;
  let quality = 0.82;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const encoded = await canvasEncode(source, edge, quality);
    if (dataUrlBytes(encoded.dataUrl) <= MAX_BYTES) return encoded;
    if (quality > 0.48) quality = Math.max(0.45, quality - 0.08);
    else edge = Math.max(960, Math.round(edge * 0.82));
  }
  throw new Error("照片压缩后仍然过大，请换一张图片再试");
}

async function preparePhoto(source) {
  const rawDataUrl = await fileToDataUrl(source);
  const processed = await compressForStorage(rawDataUrl);
  const thumb = await canvasEncode(rawDataUrl, THUMB_EDGE, 0.78);
  return { __preparedPhoto: true, rawDataUrl, processed, thumb, previewDataUrl: thumb.dataUrl };
}

function mapPhoto(row) {
  return {
    ...row,
    is_cover: Boolean(row.is_cover),
    uri: row.local_path ? `file://${row.local_path}` : "",
  };
}

export class PhotoRepository {
  async listForOwner(ownerType, ownerId, { includeDeleted = false } = {}) {
    const { db } = await initializeDatabase();
    const column = ownerType === "beer" ? "beer_id" : "tasting_id";
    const where = [`${column} = ?`];
    if (!includeDeleted) where.push("deleted_at IS NULL");
    const result = await db.query(`SELECT * FROM photos WHERE ${where.join(" AND ")} ORDER BY is_cover DESC, sort_order ASC, created_at ASC`, [ownerId]);
    return (result.values || []).map(mapPhoto);
  }

  async addPhoto({ ownerType, ownerId, source, name = "photo" }) {
    if (!ownerId || !source) throw new Error("图片信息不完整");
    const prepared = source?.__preparedPhoto ? source : null;
    const raw = prepared ? prepared.rawDataUrl : await fileToDataUrl(source);
    const processed = prepared ? prepared.processed : await compressForStorage(raw);
    const thumb = prepared ? prepared.thumb : await canvasEncode(raw, THUMB_EDGE, 0.78);
    const id = uuid();
    const basePath = `${PHOTO_DIRECTORY}/${id}`;
    const originalPath = `${basePath}.webp`;
    const thumbnailPath = `${basePath}-thumb.webp`;
    await writeFile(originalPath, processed.dataUrl);
    try {
      await writeFile(thumbnailPath, thumb.dataUrl);
      const timestamp = now();
      const column = ownerType === "beer" ? "beer_id" : "tasting_id";
      await withTransaction(async (db) => {
        const current = await db.query(`SELECT COUNT(*) AS count FROM photos WHERE ${column} = ? AND deleted_at IS NULL`, [ownerId]);
        const sortOrder = Number(current.values?.[0]?.count || 0);
        await db.run(`INSERT INTO photos (
          id, beer_id, tasting_id, local_path, thumbnail_path, sort_order, mime_type,
          width, height, byte_size, checksum_sha256, created_at, updated_at,
          sync_status, revision, deleted_at, is_cover
        ) VALUES (?, ?, ?, ?, ?, ?, 'image/webp', ?, ?, ?, '', ?, ?, 'local', 1, NULL, ?)`, [
          id, ownerType === "beer" ? ownerId : null, ownerType === "tasting" ? ownerId : null,
          originalPath, thumbnailPath, sortOrder, processed.width, processed.height,
          Math.round(processed.dataUrl.length * 0.75), timestamp, timestamp, sortOrder === 0 ? 1 : 0,
        ], false);
      });
      return this.getPhotoById(id);
    } catch (error) {
      await deleteFile(originalPath);
      await deleteFile(thumbnailPath);
      throw error;
    }
  }

  async getPhotoById(id) {
    const { db } = await initializeDatabase();
    const result = await db.query("SELECT * FROM photos WHERE id = ? LIMIT 1", [id]);
    return result.values?.[0] ? mapPhoto(result.values[0]) : null;
  }

  async setCover(id, ownerType, ownerId) {
    const column = ownerType === "beer" ? "beer_id" : "tasting_id";
    await withTransaction(async (db) => {
      await db.run(`UPDATE photos SET is_cover = 0, updated_at = ?, revision = revision + 1 WHERE ${column} = ? AND deleted_at IS NULL`, [now(), ownerId], false);
      await db.run("UPDATE photos SET is_cover = 1, updated_at = ?, revision = revision + 1 WHERE id = ? AND deleted_at IS NULL", [now(), id], false);
    });
    return this.getPhotoById(id);
  }

  async softDeletePhoto(id) {
    const timestamp = now();
    await withTransaction((db) => db.run("UPDATE photos SET deleted_at = ?, is_cover = 0, updated_at = ?, sync_status = 'pending_delete', revision = revision + 1 WHERE id = ? AND deleted_at IS NULL", [timestamp, timestamp, id], false));
    return this.getPhotoById(id);
  }

  async restorePhoto(id) {
    await withTransaction((db) => db.run("UPDATE photos SET deleted_at = NULL, updated_at = ?, sync_status = 'pending_update', revision = revision + 1 WHERE id = ?", [now(), id], false));
    return this.getPhotoById(id);
  }

  async listDeletedPhotos() {
    const { db } = await initializeDatabase();
    const result = await db.query("SELECT * FROM photos WHERE deleted_at IS NOT NULL ORDER BY updated_at DESC");
    return (result.values || []).map(mapPhoto);
  }

  async purgePhotoFiles(id) {
    const photo = await this.getPhotoById(id);
    if (!photo) return;
    await deleteFile(photo.local_path);
    await deleteFile(photo.thumbnail_path);
    const { db } = await initializeDatabase();
    await db.run("DELETE FROM photos WHERE id = ?", [id], false);
  }

  async readDataUrl(path) {
    const result = await readFile(path);
    return `data:image/webp;base64,${result.data}`;
  }

  async pickFromGallery() {
    const result = await plugins().Camera?.pickImages?.({ quality: 90, limit: 0 });
    return result?.photos || [];
  }

  async takePhoto() {
    const result = await plugins().Camera?.getPhoto?.({ resultType: "DATA_URL", source: "CAMERA", quality: 90, correctOrientation: true });
    return result?.dataUrl || null;
  }

  preparePhoto(source) { return preparePhoto(source); }
}

export const photoRepository = new PhotoRepository();
export { MAX_EDGE, THUMB_EDGE, MAX_BYTES, PHOTO_DIRECTORY };
