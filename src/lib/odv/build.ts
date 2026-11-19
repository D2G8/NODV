import { parseDateCell, parseTimeCell } from "./dates";
import { parseNumber, splitNameUnit } from "./detect";
import { summarise } from "./interpret";

export { measuredIndices, stationLabel } from "./interpret";
import type {
  ColumnMapping,
  ColumnRole,
  Dataset,
  DatasetColumn,
  MetaRole,
  RawCell,
  RawTable,
  Station,
  Variable,
} from "./types";

const STATION_KEY_ROLES: MetaRole[] = ["cruise", "station", "date", "time", "lon", "lat"];
const META_ROLES: MetaRole[] = ["cruise", "station", "type", "date", "time", "lon", "lat", "botDepth"];

export function variableLabel(name: string, unit: string) {
  return unit ? `${name} [${unit}]` : name;
}

function slug(s: string, used: Set<string>) {
  const base =
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "var";
  let key = base;
  let i = 2;
  while (used.has(key)) key = `${base}_${i++}`;
  used.add(key);
  return key;
}

interface PendingStation {
  meta: Record<MetaRole, RawCell>;
  extra: Record<string, string>;
  rows: { v: number[]; t: string[]; o: number }[];
}

const NUMERIC_ROLES = new Set<ColumnRole>(["primary", "variable", "intervalTop", "intervalBottom"]);

export function buildDataset(table: RawTable, mapping: ColumnMapping): Dataset {
  const { roles, missingValues, dayFirst } = mapping;
  const col = (r: MetaRole | "primary") => roles.indexOf(r);
  const metaCols = Object.fromEntries(META_ROLES.map((r) => [r, col(r)])) as Record<MetaRole, number>;
  const primaryCol = col("primary");
  const varCols = roles.map((r, i) => (NUMERIC_ROLES.has(r) ? i : -1)).filter((i) => i >= 0);
  // Primary variable is always first so station profiles sort by it.
  varCols.sort((a, b) => (a === primaryCol ? -1 : b === primaryCol ? 1 : a - b));
  const extraCols = roles.map((r, i) => (r === "metadata" ? i : -1)).filter((i) => i >= 0);
  const warnings: string[] = [];

  const used = new Set<string>();
  const variables: Variable[] = varCols.map((c) => {
    const { name, unit } = splitNameUnit(table.headers[c]);
    const sampling = roles[c] === "intervalTop" || roles[c] === "intervalBottom";
    return { key: slug(name, used), name, unit, label: variableLabel(name, unit), ...(sampling && { sampling }) };
  });
  const extraKeys = extraCols.map((c) => table.headers[c]);
  const noteCols = roles.map((r, i) => (r === "note" ? i : -1)).filter((i) => i >= 0);
  const noteKeys = noteCols.map((c) => table.headers[c]);
  const columns: DatasetColumn[] = [];
  roles.forEach((r, c) => {
    if (NUMERIC_ROLES.has(r)) columns.push({ kind: "variable", index: varCols.indexOf(c) });
    else if (r === "note") columns.push({ kind: "note", key: table.headers[c] });
  });
  let rowOrder = 0;

  const groups = new Map<string, PendingStation>();
  const prev: Record<MetaRole, RawCell> = {
    cruise: null, station: null, type: null, date: null, time: null, lon: null, lat: null, botDepth: null,
  };
  let prevExtra: Record<string, string> = {};
  const fromExcel = table.format === "excel";

  for (const row of table.rows) {
    const keyCellsEmpty = STATION_KEY_ROLES.every((r) => metaCols[r] < 0 || row[metaCols[r]] === null);
    if (!keyCellsEmpty) {
      for (const r of META_ROLES) {
        const c = metaCols[r];
        const v = c >= 0 ? row[c] : null;
        // ODV spreadsheets list metadata only on a station's first row; spreadsheets
        // sometimes leave unchanged cells blank. Either way, inherit blanks.
        if (v !== null) prev[r] = v;
        else if (r === "type" || r === "botDepth") prev[r] = null;
      }
      const ex: Record<string, string> = {};
      extraCols.forEach((c, i) => {
        const v = row[c];
        ex[extraKeys[i]] = v === null ? "" : String(v);
      });
      prevExtra = ex;
    }
    const values = varCols.map((c) => parseNumber(row[c], missingValues));
    const texts = noteCols.map((c) => (row[c] === null ? "" : String(row[c])));
    if (values.every((v) => Number.isNaN(v)) && texts.every((t) => t === "")) continue;

    const key = STATION_KEY_ROLES.map((r) => String(prev[r] ?? "")).join("\u0001");
    let g = groups.get(key);
    if (!g) {
      g = { meta: { ...prev }, extra: { ...prevExtra }, rows: [] };
      groups.set(key, g);
    } else {
      for (const k of extraKeys) if (!g.extra[k] && prevExtra[k]) g.extra[k] = prevExtra[k];
    }
    g.rows.push({ v: values, t: texts, o: rowOrder++ });
  }

  const stations: Station[] = [];
  let skippedNoPos = 0;
  let stationCounter = 0;
  for (const g of groups.values()) {
    let lon = parseNumber(g.meta.lon, missingValues);
    const lat = parseNumber(g.meta.lat, missingValues);
    if (Number.isNaN(lon) || Number.isNaN(lat) || Math.abs(lat) > 90) {
      skippedNoPos++;
      continue;
    }
    if (lon > 180) lon -= 360;
    let date = parseDateCell(g.meta.date, dayFirst, fromExcel);
    const tod = parseTimeCell(g.meta.time);
    if (tod !== null) date = (date === null ? null : Math.floor(date / 86_400_000) * 86_400_000 + tod);

    g.rows.sort((a, b) => {
      const pa = a.v[0];
      const pb = b.v[0];
      if (Number.isNaN(pa)) return 1;
      if (Number.isNaN(pb)) return -1;
      return pa - pb;
    });
    const n = g.rows.length;
    const data = variables.map((_, vi) => {
      const arr = new Float64Array(n);
      for (let i = 0; i < n; i++) arr[i] = g.rows[i].v[vi];
      return arr;
    });
    const notes = Object.fromEntries(noteKeys.map((k, ki) => [k, g.rows.map((r) => r.t[ki])]));
    const fileOrder = g.rows.map((_, i) => i).sort((a, b) => g.rows[a].o - g.rows[b].o);
    stationCounter++;
    const bd = parseNumber(g.meta.botDepth, missingValues);
    stations.push({
      index: stations.length,
      cruise: g.meta.cruise === null ? "" : String(g.meta.cruise),
      station: g.meta.station === null ? String(stationCounter) : String(g.meta.station),
      type: g.meta.type === null ? "" : String(g.meta.type),
      date,
      lon,
      lat,
      botDepth: Number.isNaN(bd) ? null : bd,
      extra: g.extra,
      notes,
      data,
      n,
      fileOrder,
    });
  }

  if (skippedNoPos)
    warnings.push(`${skippedNoPos} station(s) were skipped because they had no valid latitude/longitude.`);
  if (metaCols.date < 0) warnings.push("No date column was mapped, so time filters and time axes are unavailable.");

  const top = varCols.indexOf(roles.indexOf("intervalTop"));
  const bottom = varCols.indexOf(roles.indexOf("intervalBottom"));
  const interval = top >= 0 && bottom >= 0 ? { top, bottom } : detectInterval(variables, stations);
  if (interval) for (const i of [interval.top, interval.bottom]) variables[i].sampling = true;

  const dataset: Omit<Dataset, "summary"> = {
    interval,
    name: table.fileName.replace(/\.[^.]+$/, "").replace(/\.odv$/i, ""),
    fileName: table.fileName,
    format: table.format,
    variables,
    primaryIndex: 0,
    extraKeys,
    noteKeys,
    columns,
    stations,
    warnings,
  };
  return { ...dataset, summary: summarise(dataset) };
}

const BOUND_WORD = /\b(from|to|top|bottom|min|max|start|end|upper|lower|shallow|deep)\b/i;

function detectInterval(variables: Variable[], stations: Station[]): Dataset["interval"] {
  const bounds = variables
    .map((v, i) => ({ v, i }))
    .filter(({ v, i }) => i !== 0 && /depth|pressure/i.test(v.name) && BOUND_WORD.test(v.name));
  if (bounds.length !== 2) return undefined;
  const mean = (vi: number) => {
    let sum = 0;
    let n = 0;
    for (const st of stations)
      for (const x of st.data[vi])
        if (!Number.isNaN(x)) {
          sum += x;
          n++;
        }
    return n ? sum / n : 0;
  };
  const [a, b] = bounds.map((x) => x.i);
  return mean(a) <= mean(b) ? { top: a, bottom: b } : { top: b, bottom: a };
}
