import { ALL_STATION_SHEETS, combineStationSheets, findStationSheets, sheetMatrix } from "./station-sheets";
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
    const table = combineStationSheets(chosenSheets, fileName, single ? [single.name] : sheetNames, stationSheets);
    return {
      ...table,
      sheetName: single ? single.name : stationSheets.length > 1 ? ALL_STATION_SHEETS : stationSheets[0].name,
      sheetNames: listed,
    };
  }

  const chosen =
    sheetName && sheetNames.includes(sheetName) ? sheetName : pickBestSheet(wb, XLSX);
  const table = matrixToTable(sheetMatrix(wb, chosen, XLSX, normaliseCell), fileName, "excel");
  return { ...table, sheetName: chosen, sheetNames: listed };
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
  return { ...matrixToTable(matrix, fileName, format), comments };
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

const isTextCell = (v: RawCell) => typeof v === "string" && Number.isNaN(Number(v));

/**
 * Finds the header row (skipping title rows that spreadsheets often have), joins a second header
 * row such as "Depth interval" over "From bottom | From top", and pads rows. A sheet whose first
 * row is already data gets numbered column names.
 */
function matrixToTable(
  matrix: RawCell[][],
  fileName: string,
  format: SourceFormat,
): RawTable {
  const headerRow = findHeaderRow(matrix);
  const top = headerRow >= 0 ? matrix[headerRow] : [];
  const next = headerRow >= 0 ? matrix[headerRow + 1] : undefined;
  const afterNext = matrix[headerRow + 2];
  const subHeader =
    next !== undefined &&
    next.some(isTextCell) &&
    next.every((v) => v === null || isTextCell(v)) &&
    countFilled(next) < countFilled(top) + 1 &&
    afterNext !== undefined &&
    afterNext.some((v) => typeof v === "number" || (v !== null && !isTextCell(v)));
  const rows = matrix.slice(headerRow + (subHeader ? 2 : 1));
  const width = Math.max(top.length, subHeader ? next.length : 0, ...rows.slice(0, 500).map((r) => r.length));
  const seen = new Map<string, number>();
  const headers: string[] = [];
  for (let c = 0; c < width; c++) {
    const parts = [top[c], subHeader ? next[c] : null]
      .filter((v): v is string | number => v !== null && v !== undefined && String(v).trim() !== "")
      .map((v) => String(v).trim());
    let h = [...new Set(parts)].join(" ");
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
    const textCells = row.filter(isTextCell).length;
    // A title in a cell merged across the sheet repeats one value in every column; it isn't a header.
    const distinct = new Set(row.filter((v) => v !== null && v !== "")).size;
    if (filled >= Math.max(2, widest * 0.6) && textCells >= filled * 0.6 && distinct >= Math.max(2, filled * 0.5)) return i;
  }
  const first = matrix[0] ?? [];
  return first.length > 0 && first.filter(isTextCell).length === 0 ? -1 : 0;
}

function countFilled(row: RawCell[]) {
  return row.filter((v) => v !== null && v !== "").length;
}
