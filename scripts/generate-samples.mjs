// Generates synthetic but oceanographically plausible sample datasets in public/samples.
// Run with: npm run samples
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "samples");
mkdirSync(outDir, { recursive: true });

let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const noise = (amp) => (rand() - 0.5) * 2 * amp;
const gauss = (x, mu, sd) => Math.exp(-(((x - mu) / sd) ** 2));
const r = (v, d) => Number(v.toFixed(d));

// ---------- Atlantic meridional transect (ODV spreadsheet format) ----------
const LEVELS = [2, 10, 20, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500];

function atlanticProfile(lat, z) {
  const alat = Math.abs(lat);
  const sst = 28.5 - 17 * (alat / 50) ** 1.6;
  const mld = 20 + 60 * (alat / 50) ** 2;
  const h = 110 + 380 * gauss(alat, 27, 11);
  const tDeep = 1.2 + 3.2 * Math.exp(-z / 1400) + (lat > 0 ? 0.8 * Math.exp(-z / 3000) : 0);
  const zz = Math.max(0, z - mld);
  const temp = tDeep + (sst - tDeep) * Math.exp(-zz / h);

  const sSurf = 35.1 + 2.0 * gauss(lat, 24, 9) + 1.3 * gauss(lat, -20, 9) - 0.7 * gauss(lat, 6, 5) - (lat < -38 ? 0.8 : 0);
  const sDeep = lat > 0 ? 34.95 : 34.75;
  let sal = sDeep + (sSurf - sDeep) * Math.exp(-zz / (h * 1.2));
  sal -= (lat < 20 ? 0.55 : 0.2) * gauss(z, 850, 320) * (lat < 0 ? 1 : 0.6);
  sal += lat > 15 ? 0.35 * gauss(z, 1100, 350) * gauss(lat, 35, 12) : 0;
  sal += 0.05 * gauss(z, 2500, 900);

  const o2Sat = 418 - 7.2 * temp;
  let oxy = z < mld + 10 ? o2Sat : o2Sat - 120 * (1 - Math.exp(-(z - mld) / 300));
  oxy -= 95 * gauss(z, 420, 220) * gauss(lat, 10, 10);
  oxy += 70 * (1 - Math.exp(-z / 1800)) * (lat > 0 ? 1 : 0.6);
  oxy = Math.max(35, oxy);

  const nSurf = lat < -35 ? 14 : alat > 42 ? 5 : 0.05;
  const nit = Math.min(36, nSurf + (lat < 0 ? 33 : 24) * (1 - Math.exp(-Math.max(0, z - mld * 0.8) / 520)) + 6 * gauss(z, 450, 250) * gauss(lat, 8, 10));

  const dcm = 40 + 100 * gauss(alat, 25, 10);
  const chlMax = 0.25 + 0.9 * gauss(lat, 2, 6) + 1.4 * (alat > 40 ? 1 : 0) * Math.min(1, (alat - 40) / 6);
  const chl = z > 300 ? 0 : chlMax * gauss(z, dcm, 22 + 15 * gauss(alat, 25, 10)) + 0.05 * Math.exp(-z / 60) * (1 + chlMax);

  return {
    temp: temp + noise(0.04),
    sal: sal + noise(0.006),
    oxy: oxy + noise(2),
    nit: Math.max(0.01, nit + noise(0.25)),
    chl: Math.max(0, chl + noise(0.015)),
  };
}

function writeAtlantic() {
  const header = [
    "Cruise", "Station", "Type", "yyyy-mm-ddThh:mm:ss.sss", "Longitude [degrees_east]", "Latitude [degrees_north]", "Bot. Depth [m]",
    "Depth [m]", "Temperature [°C]", "Salinity [psu]", "Oxygen [µmol/kg]", "Nitrate [µmol/kg]", "Chlorophyll a [mg/m³]",
  ];
  const lines = [
    "//<Encoding>UTF-8</Encoding>",
    "//<Creator>Ocean Data Explorer sample generator</Creator>",
    "//<DataField>Ocean</DataField>",
    "//<DataType>Profiles</DataType>",
    "//Synthetic Atlantic Meridional Transect (AMT-style) for demonstration only.",
    header.join("\t"),
  ];
  const n = 26;
  const start = Date.UTC(2025, 8, 21, 6, 0);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const lat = 49 - f * 95;
    const lon = -12 - 16 * Math.sin(f * Math.PI * 0.9) - 6 * f;
    const date = new Date(start + i * 1.4 * 86400000 + noise(2) * 3600000);
    const bot = Math.round(5100 + 500 * Math.sin(lat / 6) - 2300 * gauss(lat, -1, 4) - 3600 * (lat > 47 ? 1 : 0) + noise(120));
    const type = i % 3 === 0 ? "B" : "C";
    const levels = LEVELS.filter((z) => z < bot - 15);
    levels.forEach((z, k) => {
      const p = atlanticProfile(lat, z);
      const meta = k === 0
        ? ["AMT-SIM-25", String(i + 1).padStart(3, "0"), type, date.toISOString().slice(0, 23), r(lon, 3), r(lat, 3), bot]
        : ["", "", "", "", "", "", ""];
      const chl = z <= 300 ? r(p.chl, 3) : "";
      lines.push([...meta, z, r(p.temp, 3), r(p.sal, 3), r(p.oxy, 1), r(p.nit, 2), chl].join("\t"));
    });
  }
  writeFileSync(join(outDir, "atlantic-transect.odv.txt"), lines.join("\n") + "\n");
}

// ---------- Lisbon coast / Tagus estuary monitoring (Excel layout) ----------
const SITES = [
  ["TE01", 38.74, -9.04, 8, 0],
  ["TE02", 38.7, -9.135, 26, 0.12],
  ["TE03", 38.686, -9.2, 21, 0.25],
  ["TE04", 38.665, -9.28, 28, 0.4],
  ["CC01", 38.66, -9.35, 36, 0.55],
  ["CC02", 38.65, -9.42, 62, 0.68],
  ["CC03", 38.63, -9.5, 105, 0.8],
  ["CC04", 38.61, -9.58, 150, 0.9],
  ["CC05", 38.59, -9.68, 310, 1],
];
const SURVEYS = [
  { id: "LXC-2025-02", season: "winter", date: [2025, 1, 12] },
  { id: "LXC-2025-05", season: "spring", date: [2025, 4, 20] },
  { id: "LXC-2025-08", season: "upwelling", date: [2025, 7, 18] },
];

function coastalSample(season, marine, z, wd) {
  const sMarine = 35.9;
  const sRiver = season === "winter" ? 12 : season === "spring" ? 20 : 27;
  const strat = Math.exp(-z / (2 + 6 * marine));
  const mix = Math.min(1, marine + 0.35 * (1 - strat));
  const sal = sRiver + (sMarine - sRiver) * mix ** 0.6;
  const sst = season === "winter" ? 14.2 : season === "spring" ? 17.5 : 18.5;
  const estT = season === "winter" ? 12.5 : season === "spring" ? 19.5 : 23;
  let temp = estT + (sst - estT) * marine;
  if (season === "upwelling") temp -= marine * 4.5 * (1 - Math.exp(-z / 25)) + marine * 1.2;
  else temp -= Math.min(2.5, z / 60) * marine;
  const chlBase = season === "spring" ? 4.5 : season === "upwelling" ? 3.2 : 1.1;
  const chlEst = season === "winter" ? 2.5 : 7;
  const chl = (chlEst * (1 - marine) + chlBase * marine) * (season === "upwelling" ? gauss(z, 12, 14) : Math.exp(-z / 22)) + 0.1;
  const doSat = 14.6 - 0.39 * temp + 0.007 * temp * temp - 0.06 * (sal / 10);
  const doMgL = doSat * (1 + 0.04 * chl / 5) - (z / wd) * (season === "upwelling" ? 1.6 : 0.8) - (1 - marine) * (season === "upwelling" ? 1.3 : 0.4);
  const turb = 1 + 28 * (1 - marine) ** 2 * (season === "winter" ? 1.5 : 1) + 4 * gauss(z, wd, 4);
  const ph = 8.08 - 0.25 * (1 - marine) - (season === "upwelling" ? 0.06 * (z / 50) : 0.02 * (z / 50));
  return { temp, sal, doMgL, chl, turb, ph };
}

function writeCoastal() {
  const header = ["Survey", "Site", "Date", "Time (UTC)", "Latitude", "Longitude", "Water depth (m)", "Depth (m)", "Temp (°C)", "Salinity (PSU)", "DO (mg/L)", "Chl-a (µg/L)", "Turbidity (NTU)", "pH", "Notes"];
  const aoa = [
    ["Lisbon coast & Tagus estuary monitoring — CTD and Niskin casts, 2025 (synthetic demo data)"],
    [],
    header,
  ];
  for (const sv of SURVEYS) {
    SITES.forEach(([site, lat, lon, wd, marine], k) => {
      const date = new Date(Date.UTC(sv.date[0], sv.date[1], sv.date[2] + Math.floor(k / 5)));
      const minutes = 8 * 60 + 30 + (k % 5) * 75 + Math.round(noise(10));
      const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      const depths = [0.5, 2, 5, 10, 15, 20, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300].filter((d) => d <= wd - 2);
      depths.forEach((d, j) => {
        const s = coastalSample(sv.season, marine, d, wd);
        const note = j === 0 && sv.season === "upwelling" && marine > 0.6 ? "Upwelling filament visible on SST" : j === 0 && k === 0 && sv.season === "winter" ? "High river discharge" : "";
        aoa.push([
          sv.id, site, date, time, lat, lon, wd, d,
          r(s.temp + noise(0.05), 2), r(s.sal + noise(0.03), 2), r(s.doMgL + noise(0.06), 2),
          d > 120 ? -999 : r(Math.max(0.02, s.chl + noise(0.08)), 2),
          r(Math.max(0.2, s.turb + noise(0.3)), 1), r(s.ph + noise(0.005), 3), note,
        ]);
      });
    });
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: false, dateNF: "yyyy-mm-dd" });
  ws["!cols"] = header.map((h) => ({ wch: Math.max(10, h.length + 2) }));
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
  const readme = XLSX.utils.aoa_to_sheet([
    ["About this workbook"],
    ["Synthetic demonstration data. Missing chlorophyll below 120 m is coded as -999."],
    ["Coordinates in decimal degrees (WGS84). Times in UTC."],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, readme, "README");
  XLSX.utils.book_append_sheet(wb, ws, "CTD casts");
  writeFileSync(join(outDir, "lisbon-coastal-survey.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

writeAtlantic();
writeCoastal();
console.log("Wrote samples to", outDir);
