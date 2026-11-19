import { ALL_STATION_SHEETS, combineStationSheets, findStationSheets } from "./station-sheets";
import type { RawCell, RawTable, SourceFormat } from "./types";

const EXCEL_EXT = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;

export function isExcelFile(name: string) {
  return EXCEL_EXT.test(name);
}

export async function readFile(file: File, sheetName?: string): Promise<RawTable> {
  if (isExcelFile(file.name)) {
    return readExcel(await file.arrayBuffer(), file.name, sheetName);
  }
  return readText(await file.text(), file.name);
}

export async function readExcel(
  buffer: ArrayBuffer,
  fileName: string,
  sheetName?: string,
): Promise<RawTable> {
  const XLSX = await import("xlsx");
  // Dates stay as Excel serial numbers so they can be converted in UTC without
  // the local-timezone shifts SheetJS applies when materialising Date objects.
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, dense: true });
  const sheetNames = wb.SheetNames;
  const stationSheets = findStationSheets(wb, XLSX, normaliseCell);
  const listed = stationSheets.length > 1 ? [ALL_STATION_SHEETS, ...sheetNames] : sheetNames;

  const single = stationSheets.find((s) => s.name === sheetName);
  if (stationSheets.length > 0 && (!sheetName || sheetName === ALL_STATION_SHEETS || single)) {
    const chosenSheets = single ? [single] : stationSheets;
    const table = combineStationSheets(chosenSheets, fileName, single ? [single.name] : sheetNames);
    return addIntervalMidpoint({
      ...table,
      sheetName: single ? single.name : stationSheets.length > 1 ? ALL_STATION_SHEETS : stationSheets[0].name,
      sheetNames: listed,
    });
  }

  const chosen =
    sheetName && sheetNames.includes(sheetName) ? sheetName : pickBestSheet(wb, XLSX);
  const ws = wb.Sheets[chosen];
  const matrix = XLSX.utils.sheet_to_json<RawCell[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  const table = matrixToTable(
    matrix.map((r) => r.map(normaliseCell)),
    fileName,
    "excel",
  );
  return addIntervalMidpoint({ ...table, sheetName: chosen, sheetNames: listed });
}

const INTERVAL_WORD = /\b(from|to|top|bottom|min|max|start|end|upper|lower|shallow|deep)\b/i;

/**
 * Net tows and other depth-integrated samples record a depth interval rather than a depth.
 * When a table has two such bound columns and no plain depth column, add their midpoint so
 * samples can be placed on a depth axis.
 */
export function addIntervalMidpoint(table: RawTable): RawTable {
  const metaCols = new Set(table.metaColumns ?? []);
  const isDepthish = (h: string) => /depth|pressure|\bz\b/i.test(h) && !/bot\.?|bottom depth|water depth|sea ?floor/i.test(h.replace(/from bottom|to bottom/i, ""));
  const candidates = table.headers
    .map((h, c) => ({ h, c }))
    .filter(({ h, c }) => !metaCols.has(c) && isDepthish(h));
  const plain = candidates.filter(({ h }) => !INTERVAL_WORD.test(h));
  const bounds = candidates.filter(({ h }) => INTERVAL_WORD.test(h));
  if (plain.length > 0 || bounds.length !== 2) return table;
  const [a, b] = bounds.map((x) => x.c);
  const num = (v: RawCell) => (typeof v === "number" ? v : v === null ? NaN : Number(String(v).replace(",", ".")));
  const at = Math.min(a, b);
  const unit = table.headers[a].match(/\[([^\]]+)\]/)?.[1] ?? "m";
  return {
    ...table,
    headers: [...table.headers.slice(0, at), `Mid depth [${unit}]`, ...table.headers.slice(at)],
    rows: table.rows.map((r) => {
      const x = num(r[a]);
      const y = num(r[b]);
      const mid = Number.isFinite(x) && Number.isFinite(y) ? (x + y) / 2 : null;
      return [...r.slice(0, at), mid, ...r.slice(at)];
    }),
    metaColumns: table.metaColumns?.map((c) => (c >= at ? c + 1 : c)),
  };
}

function pickBestSheet(
  wb: import("xlsx").WorkBook,
  XLSX: typeof import("xlsx"),
): string {
  let best = wb.SheetNames[0];
  let bestCells = -1;
  for (const name of wb.SheetNames) {
    const ref = wb.Sheets[name]["!ref"];
    if (!ref) continue;
    const r = XLSX.utils.decode_range(ref);
    const cells = (r.e.r - r.s.r + 1) * (r.e.c - r.s.c + 1);
    if (cells > bestCells) {
      bestCells = cells;
      best = name;
    }
  }
  return best;
}

function normaliseCell(v: unknown): RawCell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function readText(text: string, fileName: string): RawTable {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const comments: string[] = [];
  const body: string[] = [];
  for (const line of lines) {
    if (line.startsWith("//")) comments.push(line.slice(2));
    else if (line.trim() !== "") body.push(line);
  }
  const isOdv =
    comments.length > 0 ||
    /\.odv\.txt$|\.txt$/i.test(fileName) ||
    (body[0] ?? "").includes("\t");
  const delimiter = detectDelimiter(body.slice(0, 20));
  const matrix = body.map((l) => splitLine(l, delimiter).map(normaliseCell));
  const format: SourceFormat = isOdv && delimiter === "\t" ? "odv" : "csv";
  return addIntervalMidpoint({ ...matrixToTable(matrix, fileName, format), comments });
}

function detectDelimiter(sample: string[]): string {
  const candidates = ["\t", ";", ",", "|"];
  let best = ",";
  let bestScore = 0;
  for (const d of candidates) {
    const counts = sample.map((l) => splitLine(l, d).length);
    if (counts.length === 0) continue;
    const first = counts[0];
    if (first < 2) continue;
    const consistent = counts.filter((c) => c === first).length / counts.length;
    const score = first * consistent;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  if (!line.includes('"')) return line.split(delimiter);
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Finds the header row (skipping title rows that spreadsheets often have) and pads rows. */
function matrixToTable(
  matrix: RawCell[][],
  fileName: string,
  format: SourceFormat,
): RawTable {
  const headerRow = findHeaderRow(matrix);
  const rawHeaders = matrix[headerRow] ?? [];
  const rows = matrix.slice(headerRow + 1);
  const width = Math.max(rawHeaders.length, ...rows.slice(0, 500).map((r) => r.length));
  const seen = new Map<string, number>();
  const headers: string[] = [];
  for (let c = 0; c < width; c++) {
    let h = rawHeaders[c] == null ? "" : String(rawHeaders[c]).trim();
    if (h === "") h = `Column ${c + 1}`;
    const count = seen.get(h) ?? 0;
    seen.set(h, count + 1);
    headers.push(count ? `${h} (${count + 1})` : h);
  }
  const padded = rows
    .map((r) => {
      if (r.length === width) return r;
      const copy = r.slice(0, width);
      while (copy.length < width) copy.push(null);
      return copy;
    })
    .filter((r) => r.some((v) => v !== null));
  return { fileName, format, headers, rows: padded, comments: [] };
}

function findHeaderRow(matrix: RawCell[][]): number {
  const limit = Math.min(matrix.length, 30);
  const widest = Math.max(1, ...matrix.slice(0, limit).map(countFilled));
  for (let i = 0; i < limit; i++) {
    const row = matrix[i];
    const filled = countFilled(row);
    const textCells = row.filter((v) => typeof v === "string" && isNaN(Number(v))).length;
    if (filled >= Math.max(2, widest * 0.6) && textCells >= filled * 0.6) return i;
  }
  return 0;
}

function countFilled(row: RawCell[]) {
  return row.filter((v) => v !== null && v !== "").length;
}
