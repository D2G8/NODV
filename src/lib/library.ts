"use client";

import type { Dataset } from "./odv/types";
import { MAX_LIBRARY_BYTES, type ImportSettings, type LibraryErrorCode, type SavedDataset } from "./library-shared";

export { SUPABASE_SQL_EDITOR_URL, type ImportSettings, type SavedDataset } from "./library-shared";

/** All library access goes through this app's server, which scopes rows and files to the signed-in viewer. */
export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      cache: "no-store",
      headers: json === undefined ? rest.headers : { "content-type": "application/json", ...rest.headers },
      body: json === undefined ? rest.body : JSON.stringify(json),
    });
  } catch {
    throw new LibraryError("failed", "Couldn’t reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new LibraryError(body?.error ?? "failed", body?.message ?? `Request failed (${res.status}).`);
  return body as T;
}

export async function listDatasets(): Promise<SavedDataset[]> {
  return (await api<{ items: SavedDataset[] }>("/api/library")).items;
}

export async function saveDataset(file: File, dataset: Dataset, settings: ImportSettings): Promise<SavedDataset> {
  if (file.size > MAX_LIBRARY_BYTES) throw new LibraryError("bad_request", "Files larger than 25 MB can’t be saved to the library.");
  const upload = await api<{ path: string; url: string; headers: Record<string, string> }>("/api/library/uploads", {
    method: "POST",
    json: { fileName: file.name, size: file.size },
  });
  const put = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: file }).catch(() => null);
  if (!put?.ok) throw new LibraryError("failed", "The file upload didn’t go through. Try again.");

  const dates = dataset.stations.map((s) => s.date).filter((d): d is number => d !== null);
  const { item } = await api<{ item: SavedDataset }>("/api/library", {
    method: "POST",
    json: {
      path: upload.path,
      name: dataset.name.slice(0, 200) || file.name,
      fileName: file.name.slice(0, 255),
      format: dataset.format,
      stationCount: dataset.stations.length,
      sampleCount: dataset.stations.reduce((a, s) => a + s.n, 0),
      variableCount: dataset.variables.filter((v) => !v.derived).length,
      firstDate: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
      lastDate: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
      importSettings: settings,
    },
  });
  return item;
}

export async function downloadDataset(row: SavedDataset): Promise<File> {
  const { url } = await api<{ url: string }>(`/api/library/${encodeURIComponent(row.id)}`);
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) throw new LibraryError("failed", "Couldn’t download the saved file.");
  return new File([await res.blob()], row.file_name);
}

export async function deleteDataset(row: SavedDataset) {
  await api(`/api/library/${encodeURIComponent(row.id)}`, { method: "DELETE" });
}
