"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/odv/dates";
import type { Dataset } from "@/lib/odv/types";
import { useFilteredStations, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { EmptyPlot, ViewToolbar } from "./view-chrome";

const STATION_LIMIT = 2000;

function fmt(v: number) {
  if (Number.isNaN(v)) return "";
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.001 || a >= 1e6)) return v.toExponential(3);
  return String(Math.round(v * 10000) / 10000);
}

function intervalText(data: Float64Array[], interval: Dataset["interval"], deepFirst: boolean, i: number) {
  if (!interval) return "";
  const top = fmt(data[interval.top][i]);
  const bottom = fmt(data[interval.bottom][i]);
  if (!top && !bottom) return "";
  return deepFirst ? `${bottom}–${top}` : `${top}–${bottom}`;
}

export function TableView() {
  const dataset = useStore((s) => s.dataset)!;
  const current = useStore((s) => s.current);
  const setCurrent = useStore((s) => s.setCurrent);
  const stations = useFilteredStations();
  const [tab, setTab] = useState<"samples" | "stations">("samples");
  const station = current !== null ? dataset.stations[current] : null;
  const columns = dataset.columns;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewToolbar>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="samples">Current station samples</TabsTrigger>
            <TabsTrigger value="stations">Station list ({stations.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </ViewToolbar>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "samples" ? (
          station ? (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-1 border-b bg-muted/30 px-3 py-2 text-xs">
                <Meta label="Cruise" value={station.cruise || "—"} />
                <Meta label="Station" value={station.station} />
                <Meta label="Date (UTC)" value={formatDate(station.date)} />
                <Meta label="Position" value={`${station.lat.toFixed(4)}°, ${station.lon.toFixed(4)}°`} />
                <Meta label="Bottom depth" value={station.botDepth === null ? "—" : `${station.botDepth} m`} />
                {station.type && <Meta label="Type" value={station.type} />}
                {Object.entries(station.extra).map(([k, v]) => v && <Meta key={k} label={k} value={v} />)}
              </div>
              <table className="w-max min-w-full text-xs tabular-nums">
                <thead className="sticky top-0 bg-background shadow-[0_1px_0_var(--border)]">
                  <tr>
                    {columns.map((c) =>
                      c.kind === "variable" ? (
                        <th key={`v${c.index}`} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                          {dataset.variables[c.index].label}
                        </th>
                      ) : c.kind === "interval" ? (
                        <th key="interval" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                          {c.label}
                        </th>
                      ) : (
                        <th key={`n${c.key}`} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                          {c.key}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {station.fileOrder.map((i) => (
                    <tr key={i} className="border-b hover:bg-muted/40">
                      {columns.map((c) =>
                        c.kind === "variable" ? (
                          <td
                            key={`v${c.index}`}
                            className={cn("px-3 py-1 text-right", c.index === dataset.primaryIndex && "font-medium")}
                          >
                            {fmt(station.data[c.index][i])}
                          </td>
                        ) : c.kind === "interval" ? (
                          <td key="interval" className="px-3 py-1 text-right whitespace-nowrap">
                            {intervalText(station.data, dataset.interval, c.deepFirst, i)}
                          </td>
                        ) : (
                          <td key={`n${c.key}`} className="max-w-md px-3 py-1 text-left">
                            {station.notes[c.key]?.[i]}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <EmptyPlot title="No station selected" body="Choose a station on the map or in the station list." />
          )
        ) : (
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-background shadow-[0_1px_0_var(--border)]">
              <tr className="text-left">
                {["Cruise", "Station", "Date (UTC)", "Latitude", "Longitude", "Bottom depth", "Samples"].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stations.slice(0, STATION_LIMIT).map((s) => (
                <tr
                  key={s.index}
                  onClick={() => setCurrent(s.index)}
                  className={cn("cursor-pointer border-b hover:bg-muted/40", s.index === current && "bg-red-50 hover:bg-red-50")}
                >
                  <td className="px-3 py-1">{s.cruise}</td>
                  <td className="px-3 py-1 font-medium">{s.station}</td>
                  <td className="px-3 py-1">{formatDate(s.date)}</td>
                  <td className="px-3 py-1">{s.lat.toFixed(4)}</td>
                  <td className="px-3 py-1">{s.lon.toFixed(4)}</td>
                  <td className="px-3 py-1">{s.botDepth ?? ""}</td>
                  <td className="px-3 py-1">{s.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "stations" && stations.length > STATION_LIMIT && (
          <div className="p-3 text-xs text-muted-foreground">
            Showing the first {STATION_LIMIT.toLocaleString()} stations. Narrow the filter to see others, or export.
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
