"use client";

import { useMemo } from "react";
import type { Data, Layout, Shape } from "plotly.js";
import { MessageSquareText } from "lucide-react";
import { ColorScaleSelect, VariableSelect } from "@/components/controls";
import { Plot } from "@/components/plots/plot";
import { stationLabel } from "@/lib/odv/build";
import { COLOR_SCALES } from "@/lib/odv/colormaps";
import { formatDate } from "@/lib/odv/dates";
import type { Dataset, Station } from "@/lib/odv/types";
import { useFilteredStations, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { EmptyPlot, ViewToolbar } from "./view-chrome";

const REMARK_KEY = /remark|note|comment|observ|description/i;

function noteRoles(ds: Dataset) {
  const remarks = ds.noteKeys.filter((k) => REMARK_KEY.test(k));
  const ids = ds.noteKeys.filter((k) => !REMARK_KEY.test(k));
  return { remarks, ids };
}

function fmtDepth(v: number) {
  return Number.isNaN(v) ? "?" : String(Math.round(v * 10) / 10);
}

export function IntervalView() {
  const dataset = useStore((s) => s.dataset)!;
  const current = useStore((s) => s.current);
  const setCurrent = useStore((s) => s.setCurrent);
  const colorKey = useStore((s) => s.intervalColor);
  const setColorKey = useStore((s) => s.setIntervalColor);
  const colorScale = useStore((s) => s.colorScale);
  const filtered = useFilteredStations();
  const interval = dataset.interval;

  const stations = useMemo(
    () => [...filtered].sort((a, b) => (a.date ?? a.index) - (b.date ?? b.index)),
    [filtered],
  );
  const { remarks, ids } = useMemo(() => noteRoles(dataset), [dataset]);
  const colorIdx = colorKey ? dataset.variables.findIndex((v) => v.key === colorKey) : -1;

  const { data, layout } = useMemo(() => {
    if (!interval) return { data: [], layout: {} };
    const x: number[] = [];
    const base: number[] = [];
    const height: number[] = [];
    const width: number[] = [];
    const colors: (string | number)[] = [];
    const lineColors: string[] = [];
    const text: string[] = [];
    const hover: string[] = [];
    const custom: number[] = [];
    let maxDepth = 0;

    stations.forEach((st, k) => {
      const tops = st.data[interval.top];
      const bottoms = st.data[interval.bottom];
      const groups = new Map<string, number[]>();
      for (let i = 0; i < st.n; i++) {
        const key = `${tops[i]}|${bottoms[i]}`;
        groups.set(key, [...(groups.get(key) ?? []), i]);
      }
      for (const members of groups.values()) {
        const m = members.length;
        const w = Math.min(0.6, 0.66 / m);
        members.forEach((i, j) => {
          const top = Math.min(tops[i], bottoms[i]);
          const bottom = Math.max(tops[i], bottoms[i]);
          if (Number.isNaN(top) || Number.isNaN(bottom)) return;
          maxDepth = Math.max(maxDepth, bottom);
          const remark = remarks.map((r) => st.notes[r]?.[i]).filter(Boolean).join(" · ");
          const idText = ids.map((r) => st.notes[r]?.[i]).filter(Boolean);
          x.push(k + (j - (m - 1) / 2) * w);
          base.push(top);
          height.push(Math.max(bottom - top, 0.5));
          width.push(w * 0.92);
          const cv = colorIdx >= 0 ? st.data[colorIdx][i] : NaN;
          colors.push(colorIdx >= 0 ? cv : remark ? "#f59e0b" : "#0ea5e9");
          lineColors.push(st.index === current ? "#dc2626" : "#ffffff");
          text.push(ids.length ? (st.notes[ids[ids.length - 1]]?.[i] ?? "") : "");
          const idLine = ids.map((r, ri) => (idText[ri] ? `${r}: ${idText[ri]}` : "")).filter(Boolean).join(" · ");
          hover.push(
            [
              `<b>${stationLabel(st)}</b>`,
              idLine,
              `${fmtDepth(top)}–${fmtDepth(bottom)} ${dataset.variables[interval.top].unit || "m"}`,
              colorIdx >= 0 ? `${dataset.variables[colorIdx].name}: ${Number.isNaN(cv) ? "—" : cv.toPrecision(4)}` : "",
              remark ? `<i>${wrap(remark)}</i>` : "",
            ]
              .filter(Boolean)
              .join("<br>"),
          );
          custom.push(st.index);
        });
      }
    });

    const marker: Record<string, unknown> = {
      color: colors,
      line: { color: lineColors, width: 1.5 },
    };
    if (colorIdx >= 0) {
      Object.assign(marker, {
        colorscale: COLOR_SCALES[colorScale].scale,
        showscale: true,
        colorbar: { title: { text: dataset.variables[colorIdx].label, side: "right" }, thickness: 14, outlinewidth: 0 },
      });
    }
    const traces: Partial<Data>[] = [
      {
        type: "bar",
        x,
        y: height,
        base,
        width,
        customdata: custom,
        text,
        textposition: "inside",
        insidetextanchor: "middle",
        textfont: { size: 10, color: "#0f172a" },
        hovertext: hover,
        hovertemplate: "%{hovertext}<extra></extra>",
        marker,
      } as Partial<Data>,
    ];

    const currentPos = stations.findIndex((s) => s.index === current);
    const shapes: Partial<Shape>[] =
      currentPos >= 0
        ? [
            {
              type: "rect",
              xref: "x",
              yref: "paper",
              x0: currentPos - 0.45,
              x1: currentPos + 0.45,
              y0: 0,
              y1: 1,
              fillcolor: "rgba(220,38,38,0.06)",
              line: { width: 0 },
              layer: "below",
            },
          ]
        : [];

    const axis = { zeroline: false, showline: true, linecolor: "#94a3b8", mirror: true };
    const layout: Partial<Layout> = {
      showlegend: false,
      hovermode: "closest",
      bargap: 0,
      barmode: "overlay",
      shapes,
      margin: { l: 64, r: 16, t: 16, b: 72 },
      xaxis: {
        ...axis,
        tickmode: "array",
        tickvals: stations.map((_, k) => k),
        ticktext: stations.map((s) => `${s.station}<br><span style="font-size:9px">${formatDate(s.date, false)}</span>`),
        range: [-0.6, stations.length - 0.4],
        title: { text: "Station (ordered by date)" },
        showgrid: false,
      },
      yaxis: {
        ...axis,
        title: { text: dataset.variables[interval.top].unit ? `Depth [${dataset.variables[interval.top].unit}]` : "Depth" },
        range: [maxDepth * 1.04 || 1, 0],
        gridcolor: "#eef2f7",
      },
    };
    return { data: traces, layout };
  }, [interval, stations, dataset, remarks, ids, colorIdx, colorScale, current]);

  if (!interval) {
    return <EmptyPlot title="No sampling intervals" body="This dataset has no pair of depth-interval columns (for example “from” and “to” depth)." />;
  }

  const station = current !== null ? dataset.stations[current] : null;
  const remarkCount = stations.reduce(
    (a, st) => a + Array.from({ length: st.n }, (_, i) => remarks.some((r) => st.notes[r]?.[i])).filter(Boolean).length,
    0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewToolbar>
        <VariableSelect
          label="Colour"
          allowNone
          noneLabel="Highlight remarks"
          value={colorKey}
          onChange={setColorKey}
          className="w-48"
        />
        {colorKey && <ColorScaleSelect className="w-40" />}
        {!colorKey && (
          <div className="flex items-center gap-3 pb-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-sky-500" /> Sample
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-amber-500" /> Has a remark ({remarkCount})
            </span>
          </div>
        )}
      </ViewToolbar>
      <div className="px-3 pt-2 text-xs text-muted-foreground">
        Each bar is one sample spanning its depth interval
        {ids.length ? `, labelled with ${ids[ids.length - 1]}` : ""}. Side-by-side bars share the same interval. Click a bar to
        select its station.
      </div>
      <div className="min-h-0 flex-[3] p-1">
        {stations.length === 0 ? (
          <EmptyPlot title="No stations shown" body="Your filter hides every station." />
        ) : (
          <Plot
            data={data}
            layout={layout}
            fileName="sampling-intervals"
            onPointClick={(pt) => typeof pt.customdata === "number" && setCurrent(pt.customdata)}
          />
        )}
      </div>
      {station && <StationSamples station={station} />}
    </div>
  );
}

function wrap(s: string, n = 60) {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > n) {
      lines.push(cur.trim());
      cur = w;
    } else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.join("<br>");
}

function StationSamples({ station }: { station: Station }) {
  const dataset = useStore((s) => s.dataset)!;
  const interval = dataset.interval!;
  const { remarks, ids } = noteRoles(dataset);
  const unit = dataset.variables[interval.top].unit || "m";
  return (
    <div className="flex max-h-[38%] min-h-28 flex-col border-t">
      <div className="flex flex-wrap items-baseline gap-x-3 px-3 py-1.5 text-xs">
        <span className="font-semibold">{stationLabel(station)}</span>
        <span className="text-muted-foreground">
          {formatDate(station.date)} UTC · {station.lat.toFixed(3)}°, {station.lon.toFixed(3)}°
          {station.botDepth !== null && ` · bottom ${station.botDepth} m`}
        </span>
        {Object.entries(station.extra)
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <span key={k} className="text-muted-foreground">
              {k}: <span className="text-foreground">{v}</span>
            </span>
          ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="sticky top-0 bg-background shadow-[0_1px_0_var(--border)]">
            <tr className="text-left">
              {ids.map((k) => (
                <th key={k} className="px-3 py-1.5 font-semibold whitespace-nowrap">
                  {k}
                </th>
              ))}
              <th className="px-3 py-1.5 font-semibold whitespace-nowrap">Interval [{unit}]</th>
              {remarks.map((k) => (
                <th key={k} className="w-full px-3 py-1.5 font-semibold">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {station.fileOrder.map((i) => {
              const hasRemark = remarks.some((r) => station.notes[r]?.[i]);
              return (
                <tr key={i} className={cn("border-b", hasRemark && "bg-amber-50/60")}>
                  {ids.map((k) => (
                    <td key={k} className="px-3 py-1 whitespace-nowrap">
                      {station.notes[k]?.[i] || "—"}
                    </td>
                  ))}
                  <td className="px-3 py-1 whitespace-nowrap">
                    {fmtDepth(station.data[interval.bottom][i])} → {fmtDepth(station.data[interval.top][i])}
                  </td>
                  {remarks.map((k) => (
                    <td key={k} className="px-3 py-1">
                      {station.notes[k]?.[i] ? (
                        <span className="flex items-start gap-1.5">
                          <MessageSquareText className="mt-0.5 size-3 shrink-0 text-amber-600" />
                          {station.notes[k][i]}
                        </span>
                      ) : (
                        ""
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
