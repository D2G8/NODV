import type { Station } from "./types";

const R = 6371.0088;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function cumulativeDistance(stations: Station[]) {
  const out: number[] = [];
  let acc = 0;
  stations.forEach((s, i) => {
    if (i > 0) acc += haversineKm(stations[i - 1].lat, stations[i - 1].lon, s.lat, s.lon);
    out.push(acc);
  });
  return out;
}

/** Linear interpolation of a variable at a given primary-variable value (e.g. depth). */
export function valueAtLevel(st: Station, primaryIndex: number, varIndex: number, level: number, maxGap = Infinity) {
  const p = st.data[primaryIndex];
  const v = st.data[varIndex];
  let below = -1;
  let above = -1;
  for (let i = 0; i < st.n; i++) {
    if (Number.isNaN(p[i]) || Number.isNaN(v[i])) continue;
    if (p[i] <= level && (above < 0 || p[i] >= p[above])) above = i;
    if (p[i] >= level && (below < 0 || p[i] <= p[below])) below = i;
  }
  if (above >= 0 && p[above] === level) return v[above];
  if (below >= 0 && p[below] === level) return v[below];
  if (above < 0 || below < 0) return NaN;
  const gap = p[below] - p[above];
  if (gap > maxGap) return NaN;
  const f = (level - p[above]) / gap;
  return v[above] + f * (v[below] - v[above]);
}

export function stationMaxLevel(st: Station, primaryIndex: number) {
  const p = st.data[primaryIndex];
  let m = -Infinity;
  for (let i = 0; i < st.n; i++) if (p[i] > m) m = p[i];
  return m;
}
