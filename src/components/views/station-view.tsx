"use client";

import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plot } from "@/components/plots/plot";
import { stationLabel } from "@/lib/odv/build";
import { formatDate } from "@/lib/odv/dates";
import { useFilteredStations, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { EmptyPlot, NothingMeasured, useHasMeasurements, ViewToolbar } from "./view-chrome";

const PROFILE_COLORS = ["#dc2626", "#2563eb", "#059669", "#9333ea", "#ea580c", "#0891b2"];

export function StationView() {
  const dataset = useStore((s) => s.dataset)!;
  const current = useStore((s) => s.current);
  const setCurrent = useStore((s) => s.setCurrent);
  const stationVars = useStore((s) => s.stationVars);
  const setStationVars = useStore((s) => s.setStationVars);
  const showAll = useStore((s) => s.showAllProfiles);
  const setShowAll = useStore((s) => s.setShowAllProfiles);
  const stations = useFilteredStations();
  const station = current !== null ? dataset.stations[current] : null;
  const hasMeasurements = useHasMeasurements();

  const varIdx = useMemo(
    () =>
      stationVars
        .map((k) => dataset.variables.findIndex((v) => v.key === k))
        .filter((i) => i >= 0 && i !== dataset.primaryIndex),
    [dataset, stationVars],
  );

  const { data, layout } = useMemo(() => {
    const n = varIdx.length;
    const p = dataset.primaryIndex;
    const traces: Partial<Data>[] = [];
    const layout: Partial<Layout> = {
      showlegend: false,
      margin: { l: 64, r: 16, t: 56, b: 16 },
      yaxis: {
        autorange: "reversed",
        title: { text: dataset.variables[p].label },
        zeroline: false,
        gridcolor: "#eef2f7",
        showline: true,
        linecolor: "#94a3b8",
        mirror: true,
      },
      hovermode: "closest",
    };
    const gap = n > 1 ? 0.025 : 0;
    varIdx.forEach((vi, k) => {
      const axis = k === 0 ? "x" : `x${k + 1}`;
      const layoutKey = (k === 0 ? "xaxis" : `xaxis${k + 1}`) as "xaxis";
      layout[layoutKey] = {
        domain: [k / n + gap, (k + 1) / n - gap],
        side: "top",
        title: { text: dataset.variables[vi].label, standoff: 6, font: { size: 11, color: PROFILE_COLORS[k % PROFILE_COLORS.length] } },
        zeroline: false,
        gridcolor: "#eef2f7",
        showline: true,
        linecolor: "#94a3b8",
        mirror: true,
        anchor: "y",
      };
      if (showAll) {
        const xs: number[] = [];
        const ys: number[] = [];
        const ids: number[] = [];
        const labels: string[] = [];
        for (const st of stations) {
          if (st.index === current) continue;
          const pv = st.data[p];
          const vv = st.data[vi];
          const label = stationLabel(st);
          for (let i = 0; i < st.n; i++) {
            if (Number.isNaN(vv[i]) || Number.isNaN(pv[i])) continue;
            xs.push(vv[i]);
            ys.push(pv[i]);
            ids.push(st.index);
            labels.push(label);
          }
        }
        traces.push({
          type: xs.length > 15000 ? "scattergl" : "scatter",
          mode: "markers",
          x: xs,
          y: ys,
          xaxis: axis,
          yaxis: "y",
          customdata: ids,
          text: labels,
          marker: { size: 3.5, color: "#cbd5e1" },
          hovertemplate: "%{text}<br>%{x:.4g} at %{y:.4g}<extra></extra>",
        });
      }
      if (station) {
        const pv = station.data[p];
        const vv = station.data[vi];
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < station.n; i++) {
          if (Number.isNaN(vv[i]) || Number.isNaN(pv[i])) continue;
          xs.push(vv[i]);
          ys.push(pv[i]);
        }
        const color = PROFILE_COLORS[k % PROFILE_COLORS.length];
        traces.push({
          type: "scatter",
          mode: "lines+markers",
          x: xs,
          y: ys,
          xaxis: axis,
          yaxis: "y",
          line: { color, width: 2 },
          marker: { color, size: 5 },
          hovertemplate: `${dataset.variables[vi].name}: %{x:.4g}<br>${dataset.variables[p].name}: %{y:.4g}<extra>${stationLabel(station)}</extra>`,
        });
      }
    });
    return { data: traces, layout };
  }, [dataset, varIdx, stations, station, current, showAll]);

  const toggleVar = (key: string) => {
    if (stationVars.includes(key)) setStationVars(stationVars.filter((k) => k !== key));
    else setStationVars([...stationVars, key].slice(-6));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewToolbar>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {dataset.variables.map((v, i) => {
            if (i === dataset.primaryIndex || v.sampling) return null;
            const pos = varIdx.indexOf(i);
            const on = pos >= 0;
            return (
              <button
                key={v.key}
                onClick={() => toggleVar(v.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  on ? "border-transparent bg-slate-900 text-white" : "bg-background text-muted-foreground hover:bg-muted",
                )}
                aria-pressed={on}
              >
                {on && <span className="size-2 rounded-full" style={{ background: PROFILE_COLORS[pos % PROFILE_COLORS.length] }} />}
                {v.name}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="showall" checked={showAll} onCheckedChange={setShowAll} />
          <Label htmlFor="showall" className="text-xs whitespace-nowrap">
            Other stations in grey
          </Label>
        </div>
      </ViewToolbar>
      <div className="flex items-center justify-between gap-2 px-3 pt-2 text-xs text-muted-foreground">
        {station ? (
          <span>
            <span className="font-semibold text-foreground">{stationLabel(station)}</span> · {formatDate(station.date)} ·{" "}
            {station.lat.toFixed(3)}°, {station.lon.toFixed(3)}° · {station.n} samples
          </span>
        ) : (
          <span>Select a station on the map or in the list.</span>
        )}
        <span className="hidden md:inline">Tip: ← → keys step through stations, click a grey dot to jump to it.</span>
      </div>
      <div className="min-h-0 flex-1 p-1">
        {!hasMeasurements ? (
          <NothingMeasured what="profiles" />
        ) : varIdx.length === 0 ? (
          <EmptyPlot title="No variables selected" body="Pick one or more variables above to draw their profiles." />
        ) : (
          <Plot
            data={data}
            layout={layout}
            fileName={station ? `profile-${stationLabel(station)}` : "profiles"}
            onPointClick={(pt) => typeof pt.customdata === "number" && setCurrent(pt.customdata)}
          />
        )}
      </div>
    </div>
  );
}
