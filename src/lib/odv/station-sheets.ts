import type { RawCell, RawTable } from "./types";

type XLSXModule = typeof import("xlsx");
type WorkBook = import("xlsx").WorkBook;

export const ALL_STATION_SHEETS = "All station sheets";

const LOCATION_LABEL = /^(lat|latitude|lon|long|longitude)\b/i;

interface StationSheet {
  name: string;
  meta: [string, RawCell][];
  headers: string[];
  rows: RawCell[][];
}

function sheetMatrix(wb: WorkBook, name: string, XLSX: XLSXModule, normalise: (v: unknown) => RawCell) {
  const ws = wb.Sheets[name];
  if (!ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const matrix = XLSX.utils
    .sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true })
    .map((r) => r.map(normalise));
  for (const m of ws["!merges"] ?? []) {
    const r0 = m.s.r - range.s.r;
    const c0 = m.s.c - range.s.c;
    const v = matrix[r0]?.[c0] ?? null;
    if (v === null) continue;
    for (let r = r0; r <= m.e.r - range.s.r; r++) {
      for (let c = c0; c <= m.e.c - range.s.c; c++) {
        if (!matrix[r]) continue;
        while (matrix[r].length <= c) matrix[r].push(null);
        if (matrix[r][c] === null) matrix[r][c] = v;
      }
    }
  }
  return matrix.filter((r) => r.some((v) => v !== null));
}

const isText = (v: RawCell) => typeof v === "string" && Number.isNaN(Number(v));

/**
 * Recognises sheets laid out as a "label | value" block describing one station, followed by
 * a sample table (often with a two-row header), as many field logs are kept.
 */
function parseStationSheet(name: string, matrix: RawCell[][]): StationSheet | null {
  const meta: [string, RawCell][] = [];
  let i = 0;
  for (; i < matrix.length; i++) {
    const row = matrix[i];
    const isKv = isText(row[0]) && row[1] !== null && row.slice(2).every((v) => v === null);
    if (!isKv) break;
    meta.push([String(row[0]).trim().replace(/:$/, ""), row[1]]);
  }
  if (meta.length < 3 || !meta.some(([k]) => LOCATION_LABEL.test(k))) return null;
  const top = matrix[i];
  if (!top) return null;

  const sub = matrix[i + 1];
  const subIsHeader = sub && sub.some(isText) && sub.every((v) => v === null || isText(v));
  const width = Math.max(top.length, subIsHeader ? sub.length : 0, ...matrix.slice(i + 1).map((r) => r.length));
  const headers: string[] = [];
  for (let c = 0; c < width; c++) {
    const parts = [top[c], subIsHeader ? sub[c] : null]
      .filter((v): v is string | number => v !== null)
      .map((v) => String(v).trim());
    headers.push([...new Set(parts)].join(" "));
  }
  const rows = matrix.slice(i + (subIsHeader ? 2 : 1)).map((r) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push(null);
    return out;
  });

  // Drop empty columns that are unnamed or repeat their neighbour's header (the far half of a merged cell).
  const keep = headers.map(
    (h, c) => rows.some((r) => r[c] !== null) || (h !== "" && (c === 0 || headers[c - 1] !== h)),
  );
  return {
    name,
    meta,
    headers: headers.filter((_, c) => keep[c]),
    rows: rows.map((r) => r.filter((_, c) => keep[c])),
  };
}

export function findStationSheets(wb: WorkBook, XLSX: XLSXModule, normalise: (v: unknown) => RawCell) {
  const found: StationSheet[] = [];
  for (const name of wb.SheetNames) {
    const parsed = parseStationSheet(name, sheetMatrix(wb, name, XLSX, normalise));
    if (parsed && parsed.rows.length > 0) found.push(parsed);
  }
  return found;
}

/** Joins station sheets into one flat table: one column per metadata label, then the sample columns. */
export function combineStationSheets(sheets: StationSheet[], fileName: string, allSheetNames: string[]): RawTable {
  const metaKeys: string[] = [];
  for (const s of sheets) for (const [k] of s.meta) if (!metaKeys.includes(k)) metaKeys.push(k);

  // Sheets from one template usually share column positions even when a header was renamed
  // (e.g. "Bottle (nº)" on some sheets, "Cup (nº)" on others), so align by position when possible.
  const sameWidth = sheets.every((s) => s.headers.length === sheets[0].headers.length);
  let dataHeaders: string[];
  let columnOf: (s: StationSheet, c: number) => number;
  if (sameWidth) {
    dataHeaders = sheets[0].headers.map((_, c) => {
      const names = [...new Set(sheets.map((s) => s.headers[c]).filter(Boolean))];
      return names.join(" / ") || `Column ${c + 1}`;
    });
    columnOf = (_s, c) => c;
  } else {
    dataHeaders = [];
    for (const s of sheets) for (const h of s.headers) if (h && !dataHeaders.includes(h)) dataHeaders.push(h);
    columnOf = (s, c) => dataHeaders.indexOf(s.headers[c]);
  }

  const headers = [...metaKeys, ...dataHeaders];
  const rows: RawCell[][] = [];
  for (const s of sheets) {
    const meta = metaKeys.map((k) => s.meta.find(([mk]) => mk === k)?.[1] ?? null);
    for (const r of s.rows) {
      const data: RawCell[] = new Array(dataHeaders.length).fill(null);
      r.forEach((v, c) => {
        const target = columnOf(s, c);
        if (target >= 0) data[target] = v;
      });
      rows.push([...meta, ...data]);
    }
  }
  const skipped = allSheetNames.filter((n) => !sheets.some((s) => s.name === n));
  return {
    fileName,
    format: "excel",
    headers,
    rows,
    comments: [],
    metaColumns: metaKeys.map((_, i) => i),
    notice:
      `Combined ${sheets.length} station sheet${sheets.length === 1 ? "" : "s"} (${sheets.map((s) => s.name).join(", ")}). ` +
      `Each sheet's label/value block became station metadata` +
      (skipped.length ? `; skipped ${skipped.join(", ")}.` : "."),
  };
}
