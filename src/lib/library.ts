"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ColumnEdit } from "./odv/columns";
import type { ColumnMapping, Dataset } from "./odv/types";

// Publishable keys are designed to ship to browsers; access is governed by row-level security.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vyrklvqsoxohvfvkotah.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_RN6u-HifWinNVs8ijnwcVg_gFwlWuqs";

const BUCKET = "datasets";
export const MAX_LIBRARY_BYTES = 25 * 1024 * 1024;
export const SUPABASE_SQL_EDITOR_URL = `https://supabase.com/dashboard/project/${new URL(SUPABASE_URL).hostname.split(".")[0]}/sql/new`;

export interface ImportSettings {
  sheetName?: string;
  /** Headers as read from the file, before any column edits. */
  headers: string[];
  edits?: ColumnEdit[];
  /** Roles for the columns after edits. */
  mapping: ColumnMapping;
}

export interface SavedDataset {
  id: string;
  name: string;
  file_name: string;
  format: Dataset["format"];
  storage_path: string;
  size_bytes: number;
  station_count: number;
  sample_count: number;
  variable_count: number;
  first_date: string | null;
  last_date: string | null;
  import_settings: ImportSettings;
  created_at: string;
}

export class LibraryNotSetUpError extends Error {
  constructor() {
    super("The Supabase library tables haven’t been created yet.");
  }
}

let client: SupabaseClient | null = null;
function supabase() {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return client;
}

function rethrow(error: { code?: string; message: string; statusCode?: string } | null): never | void {
  if (!error) return;
  const msg = error.message ?? "";
  if (error.code === "PGRST205" || error.code === "42P01" || /bucket not found/i.test(msg)) throw new LibraryNotSetUpError();
  throw new Error(msg || "Supabase request failed");
}

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  tab: "text/tab-separated-values",
  txt: "text/plain",
  dat: "text/plain",
};

export async function listDatasets(): Promise<SavedDataset[]> {
  const { data, error } = await supabase()
    .from("datasets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  rethrow(error);
  return (data ?? []) as SavedDataset[];
}

export async function saveDataset(file: File, dataset: Dataset, settings: ImportSettings): Promise<SavedDataset> {
  if (file.size > MAX_LIBRARY_BYTES) throw new Error("Files larger than 25 MB can’t be saved to the library.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120) || "data";
  const path = `${crypto.randomUUID()}/${safeName}`;
  const storage = supabase().storage.from(BUCKET);
  const up = await storage.upload(path, file, {
    contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
    upsert: false,
  });
  rethrow(up.error as { message: string } | null);

  const dates = dataset.stations.map((s) => s.date).filter((d): d is number => d !== null);
  const { data, error } = await supabase()
    .from("datasets")
    .insert({
      name: dataset.name.slice(0, 200) || file.name,
      file_name: file.name.slice(0, 255),
      format: dataset.format,
      storage_path: path,
      size_bytes: file.size,
      station_count: dataset.stations.length,
      sample_count: dataset.stations.reduce((a, s) => a + s.n, 0),
      variable_count: dataset.variables.filter((v) => !v.derived).length,
      first_date: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
      last_date: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
      import_settings: settings,
    })
    .select()
    .single();
  if (error) {
    await storage.remove([path]);
    rethrow(error);
  }
  return data as SavedDataset;
}

export async function downloadDataset(row: SavedDataset): Promise<File> {
  const { data, error } = await supabase().storage.from(BUCKET).download(row.storage_path);
  rethrow(error as { message: string } | null);
  return new File([data!], row.file_name);
}

export async function deleteDataset(row: SavedDataset) {
  const { error } = await supabase().from("datasets").delete().eq("id", row.id);
  rethrow(error);
  const rm = await supabase().storage.from(BUCKET).remove([row.storage_path]);
  rethrow(rm.error as { message: string } | null);
}
