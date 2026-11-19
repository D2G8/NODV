import { type ColumnEdit, editId, parseRange, suggestMergeName } from "./columns";
import type { ColumnMapping, ColumnRole, RawCell, RawTable } from "./types";

export const DEFAULT_MISSING = [-999, -9999, -99, -99.99, -999.9, 1e10, -1e10];

export function splitNameUnit(header: string): { name: string; unit: string } {
  const m = header.match(/^(.*?)\s*[[(]([^\])]*)[\])]\s*$/);
  if (m) return { name: m[1].trim() || header, unit: m[2].trim() };
  return { name: header.trim(), unit: "" };
}

export function parseNumber(v: RawCell, missing: number[] = DEFAULT_MISSING): number {
  if (v === null) return NaN;
  let n: number;
  if (typeof v === "number") n = v;
  else {
    let s = v.trim();
    if (s === "" || /^(nan|na|n\/a|null|none|-|--|nd)$/i.test(s)) return NaN;
    if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
    s = s.replace(/^[<>~]/, "");
    n = Number(s);
  }
  if (!Number.isFinite(n)) return NaN;
  for (const m of missing) if (Math.abs(n - m) < 1e-9 * Math.max(1, Math.abs(m))) return NaN;
  return n;
}

type Rule = { role: ColumnRole | "interval"; test: RegExp };

const INTERVAL_BOUND =
  /^(?!mid)(?=.*\b(depth|pressure|pres|z)\b)(?=.*\b(from|to|top|bottom|min|max|start|end|upper|lower|shallow|deep|open|close)\b)/i;

const RULES: Rule[] = [
  { role: "ignore", test: /^(qv|qf)(:|_|\b)|quality ?flag|_qc$|^qc_|flag$/i },
  { role: "cruise", test: /^(cruise|expedition|campaign|voyage|ship|vessel|survey)\b/i },
  { role: "station", test: /^(station|stn|stat|site|cast|sample ?site|location ?id|site ?id|station ?id)\b/i },
  { role: "type", test: /^type$/i },
  { role: "botDepth", test: /(bot\.?|bottom|water|total|seafloor|sea floor)\s*depth|^bathy|^echo ?depth/i },
  {
    role: "date",
    test: /yyyy|mon\/day\/yr|dd\/mm|mm\/dd|^date|datetime|^time ?stamp|^sampling ?date|^chron/i,
  },
  { role: "time", test: /^(hh:mm|time|hour|(utc|gmt|local) ?time)\b/i },
  { role: "lon", test: /^(lon|long|longitude|x_lon|lng)\b/i },
  { role: "lat", test: /^(lat|latitude|y_lat)\b/i },
  { role: "interval", test: INTERVAL_BOUND },
  { role: "primary", test: /^(mid ?depth|depth|pressure|pres|press|sample ?depth|z)\b/i },
  { role: "note", test: /remark|note|comment|observation|description|^(net|bottle|cup|niskin|tube|vial|sample ?(id|code|n[ºo°.]?)|label)\b/i },
];

function isMostlyNumeric(rows: RawCell[][], col: number, missing: number[]) {
  let filled = 0;
  let numeric = 0;
  const limit = Math.min(rows.length, 400);
  for (let i = 0; i < limit; i++) {
    const v = rows[i][col];
    if (v === null) continue;
    filled++;
    if (typeof v === "number" || !Number.isNaN(parseNumber(v, missing))) numeric++;
  }
  return { filled, numeric: filled > 0 && numeric / filled >= 0.8 };
}

const INTERVAL_HEADER = /depth|interval|layer|range|stratum|pressure|\bz\b/i;

function mostlyRanges(rows: RawCell[][], col: number) {
  let filled = 0;
  let ranges = 0;
  for (let i = 0; i < Math.min(rows.length, 400); i++) {
    const v = rows[i][col];
    if (v === null) continue;
    filled++;
    if (parseRange(v)) ranges++;
  }
  return filled > 0 && ranges / filled >= 0.6;
}

/**
 * Proposes column edits that make a table easier to read, such as joining a pair of depth-limit
 * columns ("From bottom" / "From top") into one depth-interval column.
 */
export function suggestEdits(table: RawTable): ColumnEdit[] {
  const { roles } = detectMapping(table);
  const top = roles.indexOf("intervalTop");
  const bottom = roles.indexOf("intervalBottom");
  if (top < 0 || bottom < 0 || roles.includes("interval")) return [];
  const columns = [Math.min(top, bottom), Math.max(top, bottom)].map((c) => table.headers[c]);
  const base = suggestMergeName(columns);
  const name = table.headers.includes(base) ? `${base} (merged)` : base;
  return [{ id: editId(), op: "merge", columns, name, how: "interval" }];
}

function columnMean(rows: RawCell[][], col: number, missing: number[]) {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = parseNumber(r[col], missing);
    if (!Number.isNaN(v)) {
      sum += v;
      n++;
    }
  }
  return n ? sum / n : 0;
}

export function detectMapping(table: RawTable): ColumnMapping {
  const missing = DEFAULT_MISSING;
  const taken = new Set<ColumnRole>();
  const metaCols = new Set(table.metaColumns ?? []);
  const intervalCols: number[] = [];
  const roles: ColumnRole[] = table.headers.map((header, col) => {
    const { name } = splitNameUnit(header);
    const stats = isMostlyNumeric(table.rows, col, missing);
    const isMeta = metaCols.has(col);
    if (!isMeta && !taken.has("interval") && INTERVAL_HEADER.test(header) && mostlyRanges(table.rows, col)) {
      taken.add("interval");
      return "interval";
    }
    for (const rule of RULES) {
      if (!rule.test.test(name) && !rule.test.test(header)) continue;
      if (rule.role === "ignore") return "ignore";
      if (rule.role === "interval") {
        if (isMeta || !stats.numeric) break;
        intervalCols.push(col);
        return "variable";
      }
      if (rule.role === "note") {
        if (isMeta) break;
        return "note";
      }
      if (isMeta && rule.role === "primary") break;
      if (taken.has(rule.role)) break;
      if ((rule.role === "lon" || rule.role === "lat" || rule.role === "primary") && !stats.numeric)
        break;
      taken.add(rule.role);
      return rule.role;
    }
    if (stats.filled === 0) return "ignore";
    if (isMeta) return "metadata";
    if (stats.numeric) return "variable";
    return table.format === "odv" ? "metadata" : "note";
  });

  if (intervalCols.length === 2) {
    const [a, b] = intervalCols;
    const deeperIsB = columnMean(table.rows, b, missing) >= columnMean(table.rows, a, missing);
    roles[deeperIsB ? a : b] = "intervalTop";
    roles[deeperIsB ? b : a] = "intervalBottom";
  }

  const hasInterval = roles.includes("interval") || roles.includes("intervalTop");
  if (!taken.has("primary") && !hasInterval) {
    const i = roles.findIndex((r) => r === "variable");
    if (i >= 0) roles[i] = "primary";
  }
  const dayFirst = table.headers.some((h) => /dd[./-]mm/i.test(h));
  return { roles, missingValues: missing, dayFirst };
}

export function validateMapping(mapping: ColumnMapping): string[] {
  const errs: string[] = [];
  const has = (r: ColumnRole) => mapping.roles.includes(r);
  if (!has("lon")) errs.push("Choose a longitude column.");
  if (!has("lat")) errs.push("Choose a latitude column.");
  if (!has("primary") && !has("interval") && !(has("intervalTop") && has("intervalBottom")))
    errs.push("Choose a depth or pressure column, or a depth-interval column.");
  for (const r of UNIQUE_ROLES) {
    if (mapping.roles.filter((x) => x === r).length > 1)
      errs.push(`Only one column can be "${ROLE_LABELS[r]}".`);
  }
  if (has("intervalTop") !== has("intervalBottom"))
    errs.push("Sampling intervals need both a shallow-limit and a deep-limit column.");
  if (has("interval") && has("intervalTop"))
    errs.push("Use either one depth-interval column or a pair of shallow/deep limit columns, not both.");
  return errs;
}

export const UNIQUE_ROLES: ColumnRole[] = [
  "cruise",
  "station",
  "type",
  "date",
  "time",
  "lon",
  "lat",
  "botDepth",
  "primary",
  "interval",
  "intervalTop",
  "intervalBottom",
];

export const ROLE_LABELS: Record<ColumnRole, string> = {
  cruise: "Cruise",
  station: "Station",
  type: "Type",
  date: "Date / date-time",
  time: "Time of day",
  lon: "Longitude",
  lat: "Latitude",
  botDepth: "Bottom depth",
  primary: "Depth / pressure",
  variable: "Data variable",
  interval: "Depth interval (from–to)",
  intervalTop: "Interval: shallow limit",
  intervalBottom: "Interval: deep limit",
  metadata: "Station metadata (text)",
  note: "Sample note / ID (text)",
  ignore: "Ignore",
};

export const ROLE_ORDER: ColumnRole[] = [
  "variable",
  "primary",
  "interval",
  "intervalTop",
  "intervalBottom",
  "cruise",
  "station",
  "type",
  "date",
  "time",
  "lon",
  "lat",
  "botDepth",
  "note",
  "metadata",
  "ignore",
];
