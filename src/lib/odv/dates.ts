import type { RawCell } from "./types";

const DAY_MS = 86_400_000;
const EXCEL_EPOCH_OFFSET = 25569; // days between 1899-12-30 and 1970-01-01

/** Parses a date (or date-time) cell to epoch ms UTC. */
export function parseDateCell(v: RawCell, dayFirst: boolean, fromExcel: boolean): number | null {
  if (v === null) return null;
  if (typeof v === "number") {
    if (v > 1000 && v < 3000 && Number.isInteger(v)) return Date.UTC(v, 0, 1);
    if (fromExcel && v > 0 && v < 200000) return Math.round((v - EXCEL_EPOCH_OFFSET) * DAY_MS);
    if (v > 1e11) return v;
    if (v > 1e8) return v * 1000;
    return null;
  }
  const s = v.trim();

  let m = s.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i,
  );
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", se = "0", frac = "0", tz] = m;
    let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se, Math.round(Number(`0.${frac}`) * 1000));
    if (tz && tz.toUpperCase() !== "Z") {
      const sign = tz[0] === "-" ? -1 : 1;
      const digits = tz.slice(1).replace(":", "");
      ms -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
    }
    return ms;
  }

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let [, a, b] = m.map(Number) as unknown as number[];
    const yRaw = Number(m[3]);
    const y = yRaw < 100 ? (yRaw > 50 ? 1900 + yRaw : 2000 + yRaw) : yRaw;
    const dotted = s.includes(".");
    let first = dayFirst || dotted;
    if (a > 12) first = true;
    else if (b > 12) first = false;
    if (first) [a, b] = [b, a];
    return Date.UTC(y, a - 1, b, Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  }

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));

  const parsed = Date.parse(s.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(s) ? s : `${s} UTC`);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Parses a time-of-day cell to milliseconds since midnight. */
export function parseTimeCell(v: RawCell): number | null {
  if (v === null) return null;
  if (typeof v === "number") {
    if (v >= 0 && v < 1) return Math.round(v * DAY_MS);
    if (v >= 0 && v < 2400 && Number.isInteger(v)) return (Math.floor(v / 100) * 60 + (v % 100)) * 60_000;
    return null;
  }
  const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[5]) {
    const pm = m[5].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return ((h * 60 + Number(m[2])) * 60 + Number(m[3] ?? 0)) * 1000 + Math.round(Number(`0.${m[4] ?? 0}`) * 1000);
}

export function formatDate(ms: number | null, withTime = true): string {
  if (ms === null) return "—";
  const iso = new Date(ms).toISOString();
  return withTime ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10);
}

export function toOdvDateTime(ms: number | null): string {
  if (ms === null) return "";
  return new Date(ms).toISOString().slice(0, 23);
}

export function startOfDayMs(ms: number) {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}
