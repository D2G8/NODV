import { MAX_DATASETS_PER_VIEWER, type ImportSettings } from "@/lib/library-shared";
import { libraryRoute, readJson, reply } from "@/lib/server/library-http";
import { isObjectPath, LibraryError, type NewDataset } from "@/lib/server/library-store";

export async function GET(request: Request) {
  return libraryRoute(request, async ({ owner, store }) => reply({ items: await store.list(owner) }));
}

/** Registers a file the viewer has just uploaded, with its summary and import settings. */
export async function POST(request: Request) {
  return libraryRoute(
    request,
    async ({ owner, store }) => {
      const body = await readJson(request, 300_000);
      const path = typeof body.path === "string" ? body.path : "";
      if (!isObjectPath(path, owner)) throw new LibraryError("bad_request", "Unknown upload.");
      if ((await store.count(owner)) >= MAX_DATASETS_PER_VIEWER)
        throw new LibraryError("limit", `Your library is full (${MAX_DATASETS_PER_VIEWER} datasets). Remove some to save more.`, 409);
      const size = await store.objectSize(path);
      if (!size) throw new LibraryError("bad_request", "The file hasn’t finished uploading.");
      return reply({ item: await store.insert(owner, path, parseDataset(body, size)) }, 201);
    },
    { write: true, json: true },
  );
}

function text(value: unknown, max: number, field: string) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new LibraryError("bad_request", `“${field}” must be text of up to ${max} characters.`);
  return value.trim();
}

function count(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100_000_000 ? n : 0;
}

function date(value: unknown) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function settings(value: unknown): ImportSettings {
  const s = value as ImportSettings | null;
  const ok =
    !!s &&
    typeof s === "object" &&
    Array.isArray(s.headers) &&
    s.headers.length <= 5_000 &&
    s.headers.every((h) => typeof h === "string") &&
    !!s.mapping &&
    typeof s.mapping === "object" &&
    (s.edits === undefined || Array.isArray(s.edits)) &&
    (s.sheetName === undefined || typeof s.sheetName === "string");
  if (!ok) throw new LibraryError("bad_request", "Invalid import settings.");
  return s;
}

function parseDataset(body: Record<string, unknown>, size: number): NewDataset {
  const format = body.format;
  if (format !== "odv" && format !== "csv" && format !== "excel") throw new LibraryError("bad_request", "Unknown file format.");
  return {
    name: text(body.name, 200, "name"),
    file_name: text(body.fileName, 255, "file name"),
    format,
    size_bytes: size,
    station_count: count(body.stationCount),
    sample_count: count(body.sampleCount),
    variable_count: count(body.variableCount),
    first_date: date(body.firstDate),
    last_date: date(body.lastDate),
    import_settings: settings(body.importSettings),
  };
}
