import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "../../../cursor/identity";
import { SUPABASE_PROJECT_REF, type LibraryErrorCode, type SavedDataset } from "../library-shared";

const BUCKET = "datasets";
const COLUMNS =
  "id, name, file_name, format, size_bytes, station_count, sample_count, variable_count, first_date, last_date, import_settings, created_at";

export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export type NewDataset = Omit<SavedDataset, "id" | "created_at">;

export interface LibraryStore {
  list(owner: string): Promise<SavedDataset[]>;
  count(owner: string): Promise<number>;
  /** Number of upload folders under the owner, including uploads that were never registered. */
  uploadCount(owner: string): Promise<number>;
  createUpload(objectPath: string, contentType: string): Promise<{ url: string; headers: Record<string, string> }>;
  /** Size in bytes of an uploaded object, or null when it doesn't exist. */
  objectSize(objectPath: string): Promise<number | null>;
  insert(owner: string, objectPath: string, row: NewDataset): Promise<SavedDataset>;
  find(owner: string, id: string): Promise<{ row: SavedDataset; objectPath: string } | null>;
  downloadUrl(objectPath: string): Promise<string>;
  remove(owner: string, id: string): Promise<boolean>;
}

/** Stable per-viewer key; preview and production traffic never share data. */
export function ownerKey(identity: VerifiedIdentity) {
  return createHash("sha256").update(`${identity.stage}:${identity.sub}`).digest("hex").slice(0, 32);
}

export function isDeployed() {
  return Boolean(process.env.CURSOR_APP_ID || process.env.VERCEL);
}

let store: LibraryStore | null | undefined;

/** The Supabase store when the secret key is set; a local folder in development; otherwise null. */
export function getStore(): LibraryStore | null {
  if (store !== undefined) return store;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (key) store = supabaseStore(process.env.SUPABASE_URL || `https://${SUPABASE_PROJECT_REF}.supabase.co`, key);
  else store = isDeployed() ? null : localStore(path.join(process.cwd(), ".data", "library"));
  return store;
}

export function isLocalStore() {
  return !process.env.SUPABASE_SECRET_KEY && !isDeployed();
}

function supabaseStore(url: string, key: string): LibraryStore {
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const files = () => db.storage.from(BUCKET);

  const fail = (error: { code?: string; message?: string } | null): never | void => {
    if (!error) return;
    const msg = error.message ?? "";
    if (["PGRST205", "42P01", "42703", "PGRST204"].includes(error.code ?? "") || /bucket not found|column .*owner/i.test(msg))
      throw new LibraryError("not_set_up", "The Supabase library needs its setup SQL run (or re-run).", 503);
    console.error("Supabase library error", error.code, msg);
    throw new LibraryError("failed", "The library request failed.", 502);
  };

  return {
    async list(owner) {
      const { data, error } = await db
        .from("datasets")
        .select(COLUMNS)
        .eq("owner", owner)
        .order("created_at", { ascending: false })
        .limit(200);
      fail(error);
      return (data ?? []) as SavedDataset[];
    },
    async count(owner) {
      const { count, error } = await db.from("datasets").select("id", { count: "exact", head: true }).eq("owner", owner);
      fail(error);
      return count ?? 0;
    },
    async uploadCount(owner) {
      const { data, error } = await files().list(owner, { limit: 1000 });
      fail(error);
      return data?.length ?? 0;
    },
    async createUpload(objectPath, contentType) {
      const { data, error } = await files().createSignedUploadUrl(objectPath);
      fail(error);
      return { url: data!.signedUrl, headers: { "content-type": contentType, "x-upsert": "false" } };
    },
    async objectSize(objectPath) {
      const dir = path.posix.dirname(objectPath);
      const { data, error } = await files().list(dir, { search: path.posix.basename(objectPath), limit: 10 });
      fail(error);
      const hit = data?.find((o) => o.name === path.posix.basename(objectPath) && o.id);
      return hit ? Number(hit.metadata?.size ?? 0) : null;
    },
    async insert(owner, objectPath, row) {
      const { data, error } = await db
        .from("datasets")
        .insert({ ...row, owner, storage_path: objectPath })
        .select(COLUMNS)
        .single();
      fail(error);
      return data as SavedDataset;
    },
    async find(owner, id) {
      const { data, error } = await db
        .from("datasets")
        .select(`${COLUMNS}, storage_path`)
        .eq("owner", owner)
        .eq("id", id)
        .maybeSingle();
      fail(error);
      if (!data) return null;
      const { storage_path, ...row } = data as SavedDataset & { storage_path: string };
      return { row, objectPath: storage_path };
    },
    async downloadUrl(objectPath) {
      const { data, error } = await files().createSignedUrl(objectPath, 60);
      fail(error);
      return data!.signedUrl;
    },
    async remove(owner, id) {
      const { data, error } = await db.from("datasets").delete().eq("owner", owner).eq("id", id).select("storage_path");
      fail(error);
      if (!data?.length) return false;
      const rm = await files().remove(data.map((d) => d.storage_path as string));
      fail(rm.error);
      return true;
    },
  };
}

interface LocalRow extends NewDataset {
  id: string;
  owner: string;
  storage_path: string;
  created_at: string;
}

/** Development-only stand-in for Supabase: rows in a JSON file, uploads under .data/library/files. */
function localStore(root: string): LibraryStore {
  const indexFile = path.join(root, "index.json");
  const filesRoot = path.join(root, "files");
  const read = async (): Promise<LocalRow[]> => JSON.parse(await readFile(indexFile, "utf8").catch(() => "[]"));
  const write = async (rows: LocalRow[]) => {
    await mkdir(root, { recursive: true });
    await writeFile(indexFile, JSON.stringify(rows, null, 2));
  };
  const strip = (r: LocalRow): SavedDataset => {
    const row: Partial<LocalRow> = { ...r };
    delete row.owner;
    delete row.storage_path;
    return row as SavedDataset;
  };
  const fileOf = (objectPath: string) => localFilePath(filesRoot, objectPath);

  return {
    async list(owner) {
      return (await read())
        .filter((r) => r.owner === owner)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(strip);
    },
    async count(owner) {
      return (await read()).filter((r) => r.owner === owner).length;
    },
    async uploadCount(owner) {
      return (await readdir(path.join(filesRoot, owner)).catch(() => [])).length;
    },
    async createUpload(objectPath, contentType) {
      return { url: `/api/library/local-file/${objectPath.split("/").map(encodeURIComponent).join("/")}`, headers: { "content-type": contentType } };
    },
    async objectSize(objectPath) {
      const s = await stat(fileOf(objectPath)).catch(() => null);
      return s?.isFile() ? s.size : null;
    },
    async insert(owner, objectPath, row) {
      const rows = await read();
      const saved: LocalRow = { ...row, id: randomUUID(), owner, storage_path: objectPath, created_at: new Date().toISOString() };
      await write([saved, ...rows]);
      return strip(saved);
    },
    async find(owner, id) {
      const hit = (await read()).find((r) => r.owner === owner && r.id === id);
      return hit ? { row: strip(hit), objectPath: hit.storage_path } : null;
    },
    async downloadUrl(objectPath) {
      return `/api/library/local-file/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
    },
    async remove(owner, id) {
      const rows = await read();
      const hit = rows.find((r) => r.owner === owner && r.id === id);
      if (!hit) return false;
      await write(rows.filter((r) => r !== hit));
      await rm(path.dirname(fileOf(hit.storage_path)), { recursive: true, force: true });
      return true;
    },
  };
}

const SEGMENTS = [/^[0-9a-f]{32}$/, /^[0-9a-f-]{36}$/, /^[\w.-]{1,120}$/];

/** Object paths are always "<owner>/<uuid>/<safe file name>". */
export function isObjectPath(objectPath: string, owner?: string) {
  const parts = objectPath.split("/");
  return (
    parts.length === 3 &&
    parts.every((p, i) => SEGMENTS[i].test(p) && p !== "." && p !== "..") &&
    (owner === undefined || parts[0] === owner)
  );
}

export function localFilePath(filesRoot: string, objectPath: string) {
  if (!isObjectPath(objectPath)) throw new LibraryError("bad_request", "Invalid file path.");
  const full = path.resolve(filesRoot, ...objectPath.split("/"));
  if (!full.startsWith(path.resolve(filesRoot) + path.sep)) throw new LibraryError("bad_request", "Invalid file path.");
  return full;
}

export function localFilesRoot() {
  return path.join(process.cwd(), ".data", "library", "files");
}

export function newObjectPath(owner: string, fileName: string) {
  const safeName = fileName.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "").slice(-120) || "data";
  return `${owner}/${randomUUID()}/${safeName}`;
}
