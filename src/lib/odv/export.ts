import { toOdvDateTime } from "./dates";
import type { Dataset, Station } from "./types";

type Cell = string | number | null;

function flatRows(ds: Dataset, stations: Station[], dateHeader: string) {
  const header: string[] = [
    "Cruise",
    "Station",
    "Type",
    dateHeader,
    "Longitude [degrees_east]",
    "Latitude [degrees_north]",
    "Bot. Depth [m]",
    ...ds.extraKeys,
    ...ds.variables.map((v) => v.label),
  ];
  const rows: Cell[][] = [];
  for (const st of stations) {
    for (let i = 0; i < st.n; i++) {
      rows.push([
        st.cruise,
        st.station,
        st.type || "*",
        toOdvDateTime(st.date),
        round(st.lon),
        round(st.lat),
        st.botDepth,
        ...ds.extraKeys.map((k) => st.extra[k] ?? ""),
        ...st.data.map((arr) => (Number.isNaN(arr[i]) ? null : round(arr[i]))),
      ]);
    }
  }
  return { header, rows };
}

function round(v: number) {
  return Math.round(v * 1e6) / 1e6;
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportOdvSpreadsheet(ds: Dataset, stations: Station[]) {
  const { header, rows } = flatRows(ds, stations, "yyyy-mm-ddThh:mm:ss.sss");
  const lines = [
    "//<Encoding>UTF-8</Encoding>",
    "//<Creator>Ocean Data Explorer</Creator>",
    `//<CreateTime>${new Date().toISOString().slice(0, 19)}</CreateTime>`,
    `//<Software>Ocean Data Explorer (web)</Software>`,
    `//<Source>${ds.fileName}</Source>`,
    "//<DataField>Ocean</DataField>",
    "//<DataType>Profiles</DataType>",
    header.join("\t"),
    ...rows.map((r) => r.map((v) => (v === null ? "" : String(v).replace(/\t/g, " "))).join("\t")),
  ];
  download(new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }), `${ds.name}.odv.txt`);
}

export function exportCsv(ds: Dataset, stations: Station[]) {
  const { header, rows } = flatRows(ds, stations, "Date (UTC)");
  const esc = (v: Cell) => {
    if (v === null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  download(new Blob([text + "\n"], { type: "text/csv;charset=utf-8" }), `${ds.name}.csv`);
}

export async function exportXlsx(ds: Dataset, stations: Station[]) {
  const XLSX = await import("xlsx");
  const { header, rows } = flatRows(ds, stations, "Date (UTC)");
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = header.map((h) => ({ wch: Math.max(10, Math.min(28, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const stationSheet = XLSX.utils.aoa_to_sheet([
    ["Cruise", "Station", "Date (UTC)", "Longitude", "Latitude", "Bot. Depth [m]", "Samples"],
    ...stations.map((s) => [s.cruise, s.station, toOdvDateTime(s.date), s.lon, s.lat, s.botDepth, s.n]),
  ]);
  XLSX.utils.book_append_sheet(wb, stationSheet, "Stations");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${ds.name}.xlsx`,
  );
}
