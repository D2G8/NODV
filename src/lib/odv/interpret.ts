import type { Dataset, FileSummary, Station, SummaryCheck } from "./types";

type Built = Omit<Dataset, "summary">;

const REMARK_KEY = /remark|note|comment|observ|description/i;
const NET_WORD = /\bnets?\b|multi ?net|bongo|plankton|zooplankton|wp-?2|tow/i;
const VESSEL_KEY = /vessel|ship|platform|^r\/?v\b/i;
const DECLARED_COUNT = /^(?:number|no\.?|n[ºo°]|nr\.?|#)\s*(?:of\s+)?(nets?|bottles?|samples?|cups?|niskins?|tows?|casts?)\b/i;
const ID_RANGE = /^\s*(\d+)\s*(?:to|-|–|—|&|\+|and|,)\s*(\d+)\s*$/i;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_REMARKS = 10;

export function stationLabel(s: Station) {
  return s.cruise ? `${s.cruise} · ${s.station}` : s.station;
}

/** Indices of variables that hold measurements, excluding the depth axis and sampling descriptors. */
export function measuredIndices(ds: Pick<Dataset, "variables" | "primaryIndex">) {
  return ds.variables.map((v, i) => (i === ds.primaryIndex || v.sampling ? -1 : i)).filter((i) => i >= 0);
}

const num = (v: number) => String(Math.round(v * 10) / 10);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const latText = (v: number) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? "N" : "S"}`;
const lonText = (v: number) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? "E" : "W"}`;

function dayText(ms: number, withYear = true) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
}

function periodText(first: number, last: number) {
  const a = new Date(first);
  const b = new Date(last);
  if (a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)) return `on ${dayText(first)}`;
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  return `between ${dayText(first, !sameYear)} and ${dayText(last)}`;
}

function listText(items: string[], max = 4) {
  if (items.length <= max) return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] ?? "";
  return `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
}

function range(values: number[]) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values)
    if (!Number.isNaN(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  return lo <= hi ? { lo, hi } : null;
}

/** Singular noun for a sample-ID column, e.g. "net" for "Net nº". */
function idNoun(key: string) {
  return key.match(/net|bottle|cup|niskin|tube|vial|sample|tow|cast/i)?.[0].toLowerCase() ?? "sample";
}

/**
 * Counts the distinct IDs in a sample-ID column. A pooled ID such as "6 to 8" counts once as written
 * and as three once expanded; logs use either convention for their declared totals.
 */
/** "Bottle (nº) / Cup (nº)" → "bottle/cup". */
function shortKey(key: string) {
  return key
    .replace(/\s*[([][^)\]]*[)\]]/g, "")
    .replace(/\s*\/\s*/g, "/")
    .trim()
    .toLowerCase();
}

function countIds(ids: string[]) {
  const distinct = new Set(ids.map((id) => id.trim()).filter(Boolean));
  const listed = new Set<number>();
  let expanded = 0;
  for (const id of distinct) {
    const r = id.match(ID_RANGE);
    if (r) {
      const [a, b] = [Number(r[1]), Number(r[2])].sort((x, y) => x - y);
      for (let k = a; k <= b; k++) listed.add(k);
      expanded += b - a + 1;
    } else {
      if (/^\d+$/.test(id)) listed.add(Number(id));
      expanded++;
    }
  }
  return { listed, distinct: distinct.size, expanded };
}

function classify(ds: Built, idKeys: string[]) {
  const st = ds.stations;
  if (ds.interval) {
    const words = [...idKeys, ...ds.extraKeys, ...st.flatMap((s) => Object.values(s.extra))].join(" ");
    return NET_WORD.test(words)
      ? { kind: "Depth-stratified net tow log", noun: "net sample" }
      : { kind: "Depth-interval sampling log", noun: "sample" };
  }
  const ns = st.map((s) => s.n).sort((a, b) => a - b);
  const median = ns[Math.floor(ns.length / 2)] ?? 0;
  if (st.filter((s) => s.n <= 1).length >= 0.9 * st.length) return { kind: "Surface / single-depth samples", noun: "sample" };
  const sites = new Set(st.map((s) => `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`));
  if (st.length >= 4 && sites.size <= st.length / 3)
    return { kind: `Repeat profiles at ${plural(sites.size, "fixed site")} (time series)`, noun: "sample" };
  if (median >= 40) return { kind: "CTD profiles", noun: "measurement" };
  return { kind: "Discrete-depth (bottle) profiles", noun: "sample" };
}

export function summarise(ds: Built): FileSummary {
  const stations = ds.stations;
  const measured = measuredIndices(ds);
  if (stations.length === 0) {
    return {
      kind: "No stations",
      headline: "No stations could be built from this file. Check the latitude and longitude columns.",
      facts: [],
      checks: ds.warnings.map((text) => ({ level: "warning", text })),
      measured,
    };
  }

  const idKeys = ds.noteKeys.filter((k) => !REMARK_KEY.test(k));
  const remarkKeys = ds.noteKeys.filter((k) => REMARK_KEY.test(k));
  const { kind, noun } = classify(ds, idKeys);
  const interval = ds.interval;
  const primary = ds.variables[ds.primaryIndex];
  const unit = (interval ? ds.variables[interval.top].unit : primary.unit) || (/pres/i.test(primary.name) ? "dbar" : "m");
  const isDepth = !/pres/i.test(primary.name);

  const cruises = [...new Set(stations.map((s) => s.cruise).filter(Boolean))];
  const vesselKey = ds.extraKeys.find((k) => VESSEL_KEY.test(k));
  const vessels = vesselKey ? [...new Set(stations.map((s) => s.extra[vesselKey]).filter(Boolean))] : [];
  const dates = stations.map((s) => s.date).filter((d): d is number => d !== null);
  const samples = stations.reduce((a, s) => a + s.n, 0);
  const depthValues = interval
    ? stations.flatMap((s) => [...s.data[interval.top], ...s.data[interval.bottom]])
    : stations.flatMap((s) => [...s.data[ds.primaryIndex]]);
  const depth = range(depthValues);
  const bottom = range(stations.map((s) => s.botDepth ?? NaN));
  const lat = range(stations.map((s) => s.lat))!;
  const lon = range(stations.map((s) => s.lon))!;
  const perStation = range(stations.map((s) => s.n))!;

  const source = [
    cruises.length === 1 ? `cruise ${cruises[0]}` : cruises.length > 1 ? `${cruises.length} cruises` : "",
    vessels.length === 1 ? `aboard ${vessels[0]}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  let headline =
    `${kind}${source ? ` from ${source}` : ""}: ${plural(stations.length, "station")}` +
    (dates.length ? ` sampled ${periodText(Math.min(...dates), Math.max(...dates))}` : "") +
    `, ${plural(samples, noun)}` +
    (depth ? ` covering ${num(depth.lo)}–${num(depth.hi)} ${unit}` : "") +
    ".";
  headline += measured.length
    ? ` Measured: ${listText(measured.map((i) => ds.variables[i].name))}.`
    : interval
      ? " The file records where and how each sample was taken; it has no measured values yet, so it opens in the sampling-interval view."
      : " No measured variables were found besides the depth axis.";

  const facts: FileSummary["facts"] = [];
  if (cruises.length) facts.push({ label: cruises.length > 1 ? "Cruises" : "Cruise", value: listText(cruises) });
  if (vessels.length) facts.push({ label: "Vessel", value: listText(vessels) });
  facts.push({ label: "Stations", value: listText(stations.map((s) => s.station), 8) });
  facts.push({
    label: "Period",
    value: dates.length ? `${dayText(Math.min(...dates))} – ${dayText(Math.max(...dates))}` : "No dates",
  });
  facts.push({
    label: "Area",
    value:
      lat.lo === lat.hi && lon.lo === lon.hi
        ? `${latText(lat.lo)}, ${lonText(lon.lo)}`
        : `${latText(lat.lo)} to ${latText(lat.hi)}, ${lonText(lon.lo)} to ${lonText(lon.hi)}`,
  });
  if (depth) facts.push({ label: interval ? "Depth sampled" : "Depth range", value: `${num(depth.lo)}–${num(depth.hi)} ${unit}` });
  if (bottom) facts.push({ label: "Bottom depth", value: bottom.lo === bottom.hi ? `${num(bottom.lo)} m` : `${num(bottom.lo)}–${num(bottom.hi)} m` });
  facts.push({
    label: "Samples",
    value: `${samples.toLocaleString()} (${perStation.lo === perStation.hi ? perStation.lo : `${perStation.lo}–${perStation.hi}`} per station)`,
  });
  facts.push({
    label: "Measured",
    value: measured.length ? listText(measured.map((i) => ds.variables[i].label), 6) : "Nothing yet (sampling log)",
  });
  if (interval) facts.push({ label: "Intervals", value: `${ds.variables[interval.top].name} → ${ds.variables[interval.bottom].name}` });
  if (idKeys.length) facts.push({ label: "Sample IDs", value: idKeys.join(", ") });
  const otherMeta = ds.extraKeys.filter((k) => k !== vesselKey);
  if (otherMeta.length) facts.push({ label: "Also logged", value: listText(otherMeta, 5) });

  const checks: SummaryCheck[] = ds.warnings.map((text) => ({ level: "warning", text }));
  const intervalText = (s: Station, i: number) =>
    interval ? `${num(s.data[interval.bottom][i])}–${num(s.data[interval.top][i])} ${unit}` : `${num(s.data[ds.primaryIndex][i])} ${unit}`;
  const sampleName = (s: Station, i: number) => {
    const key = idKeys[0];
    const id = key ? s.notes[key]?.[i] : "";
    return id ? `${idNoun(key)} ${id}` : `sample at ${intervalText(s, i)}`;
  };

  for (const s of stations) {
    const label = `Station ${s.station}`;

    for (const key of ds.extraKeys) {
      const m = key.match(DECLARED_COUNT);
      if (!m) continue;
      const declared = parseInt(s.extra[key], 10);
      if (!Number.isFinite(declared)) continue;
      const word = m[1].toLowerCase().replace(/s$/, "");
      const idKey = idKeys.find((k) => idNoun(k) === word) ?? idKeys[0];
      const { listed, distinct, expanded } = idKey
        ? countIds(s.notes[idKey] ?? [])
        : { listed: new Set<number>(), distinct: s.n, expanded: s.n };
      if (declared === distinct || declared === expanded) continue;
      if (expanded < declared) {
        const missing = Array.from({ length: declared }, (_, k) => k + 1).filter((k) => !listed.has(k));
        checks.push({
          level: "warning",
          text:
            `${label}: the log says ${plural(declared, word)} but only ${expanded} ${expanded === 1 ? "is" : "are"} listed` +
            (listed.size && missing.length ? `. No row for ${word} ${listText(missing.map(String))}.` : "."),
        });
      } else {
        checks.push({ level: "warning", text: `${label}: ${expanded} ${word}s are listed but the log says ${declared}.` });
      }
    }

    const [mainId, subId] = idKeys;
    if (mainId) {
      const rowsById = new Map<string, number[]>();
      for (const i of s.fileOrder) {
        const id = s.notes[mainId]?.[i]?.trim();
        if (id) rowsById.set(id, [...(rowsById.get(id) ?? []), i]);
      }
      const splits: string[] = [];
      for (const [id, rows] of rowsById) {
        if (ID_RANGE.test(id))
          checks.push({
            level: "info",
            text: `${label}: ${idNoun(mainId)}s ${id} were pooled into one sample (${intervalText(s, rows[0])}).`,
          });
        if (rows.length > 1) {
          const parts = subId ? rows.map((i) => s.notes[subId]?.[i]).filter(Boolean) : [];
          splits.push(`${idNoun(mainId)} ${id} into ${rows.length}${parts.length ? ` (${shortKey(subId)} ${parts.join(", ")})` : ""}`);
        }
      }
      if (splits.length) checks.push({ level: "info", text: `${label}: catch split into several samples: ${listText(splits, 6)}.` });
    }

    if (interval) {
      const seen = new Set<string>();
      const spans = [...Array(s.n).keys()]
        .map((i) => {
          const a = s.data[interval.top][i];
          const b = s.data[interval.bottom][i];
          return { top: Math.min(a, b), bottom: Math.max(a, b) };
        })
        .filter((x) => !Number.isNaN(x.top) && !Number.isNaN(x.bottom))
        .filter((x) => {
          const k = `${x.top}|${x.bottom}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .sort((a, b) => a.top - b.top || a.bottom - b.bottom);
      for (let k = 1; k < spans.length; k++) {
        const prev = spans[k - 1];
        const next = spans[k];
        if (next.top > prev.bottom + 0.5)
          checks.push({ level: "warning", text: `${label}: nothing was sampled between ${num(prev.bottom)} and ${num(next.top)} ${unit}.` });
        else if (next.top < prev.bottom - 0.5)
          checks.push({
            level: "info",
            text: `${label}: intervals ${num(prev.bottom)}–${num(prev.top)} and ${num(next.bottom)}–${num(next.top)} ${unit} overlap.`,
          });
      }
    }

    if (isDepth && s.botDepth !== null && s.botDepth > 0) {
      const deepest = range(interval ? [...s.data[interval.bottom]] : [...s.data[ds.primaryIndex]]);
      if (deepest && deepest.hi > s.botDepth * 1.02 + 1)
        checks.push({
          level: "warning",
          text: `${label}: samples reach ${num(deepest.hi)} m, deeper than the ${num(s.botDepth)} m bottom depth.`,
        });
    }
  }

  const byStation = new Map<string, Station[]>();
  for (const s of stations) byStation.set(`${s.cruise}|${s.station}`, [...(byStation.get(`${s.cruise}|${s.station}`) ?? []), s]);
  for (const group of byStation.values()) {
    if (group.length < 2) continue;
    const far = group.some((s) => Math.abs(s.lat - group[0].lat) > 0.1 || Math.abs(s.lon - group[0].lon) > 0.1);
    if (far) checks.push({ level: "warning", text: `Station ${group[0].station} appears at ${group.length} different positions.` });
  }
  const undated = stations.filter((s) => s.date === null).length;
  if (dates.length && undated) checks.push({ level: "warning", text: `${plural(undated, "station")} ${undated === 1 ? "has" : "have"} no date.` });

  const remarks: string[] = [];
  for (const s of stations)
    for (const i of s.fileOrder)
      for (const key of remarkKeys) {
        const text = s.notes[key]?.[i];
        if (!text) continue;
        const line = `Station ${s.station}, ${sampleName(s, i)}${interval && idKeys.length ? ` (${intervalText(s, i)})` : ""}: “${text}”`;
        if (!remarks.includes(line)) remarks.push(line);
      }
  for (const text of remarks.slice(0, MAX_REMARKS)) checks.push({ level: "info", text });
  if (remarks.length > MAX_REMARKS)
    checks.push({ level: "info", text: `…and ${remarks.length - MAX_REMARKS} more remarks. They are listed with each station's samples.` });

  checks.sort((a, b) => (a.level === b.level ? 0 : a.level === "warning" ? -1 : 1));
  return { kind, headline, facts, checks, measured };
}
