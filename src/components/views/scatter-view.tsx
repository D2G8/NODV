"use client";

import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ColorScaleSelect, VariableSelect } from "@/components/controls";
import { Plot } from "@/components/plots/plot";
import { stationLabel } from "@/lib/odv/build";
import { COLOR_SCALES } from "@/lib/odv/colormaps";
import { useFilteredStations, useStore } from "@/lib/store";
import { EmptyPlot, ViewToolbar } from "./view-chrome";

export function ScatterView() {
  const dataset = useStore((s) => s.dataset)!;
  const scatter = useStore((s) => s.scatter);
  const setScatter = useStore((s) => s.setScatter);
  const current = useStore((s) => s.current);
  const setCurrent = useStore((s) => s.setCurrent);
  const colorScale = useStore((s) => s.colorScale);
  const stations = useFilteredStations();

  const xi = dataset.variables.findIndex((v) => v.key === scatter.x);
  const yi = dataset.variables.findIndex((v) => v.key === scatter.y);
  const zi = scatter.z ? dataset.variables.findIndex((v) => v.key === scatter.z) : -1;
  const reverseY = scatter.reverseY || yi === dataset.primaryIndex;

  const { data, layout, count } = useMemo(() => {
    if (xi < 0 || yi < 0) return { data: [], layout: {}, count: 0 };
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    const ids: number[] = [];
    const labels: string[] = [];
    const cx: number[] = [];
    const cy: number[] = [];
    for (const st of stations) {
      const X = st.data[xi];
      const Y = st.data[yi];
      const Z = zi >= 0 ? st.data[zi] : null;
      const label = stationLabel(st);
      for (let i = 0; i < st.n; i++) {
        if (Number.isNaN(X[i]) || Number.isNaN(Y[i])) continue;
        if (Z && Number.isNaN(Z[i])) continue;
        if (st.index === current) {
          cx.push(X[i]);
          cy.push(Y[i]);
        }
        xs.push(X[i]);
        ys.push(Y[i]);
        if (Z) zs.push(Z[i]);
        ids.push(st.index);
        labels.push(label);
      }
    }
    const vx = dataset.variables[xi];
    const vy = dataset.variables[yi];
    const vz = zi >= 0 ? dataset.variables[zi] : null;
    const traces: Partial<Data>[] = [
      {
        type: xs.length > 20000 ? "scattergl" : "scatter",
        mode: "markers",
        x: xs,
        y: ys,
        customdata: ids,
        text: labels,
        marker: vz
          ? {
              size: 5,
              color: zs,
              colorscale: COLOR_SCALES[colorScale].scale,
              showscale: true,
              colorbar: { title: { text: vz.label, side: "right" }, thickness: 14, outlinewidth: 0 },
            }
          : { size: 5, color: "#1d4ed8", opacity: 0.7 },
        hovertemplate: `%{text}<br>${vx.name}: %{x:.4g}<br>${vy.name}: %{y:.4g}${vz ? `<br>${vz.name}: %{marker.color:.4g}` : ""}<extra></extra>`,
      },
    ];
    if (cx.length) {
      traces.push({
        type: "scatter",
        mode: "lines+markers",
        x: cx,
        y: cy,
        line: { color: "#dc2626", width: 1.5 },
        marker: { size: 8, color: "rgba(0,0,0,0)", line: { color: "#dc2626", width: 2 } },
        hoverinfo: "skip",
      });
    }
    const axis = { zeroline: false, gridcolor: "#eef2f7", showline: true, linecolor: "#94a3b8", mirror: true };
    const layout: Partial<Layout> = {
      showlegend: false,
      hovermode: "closest",
      margin: { l: 64, r: 16, t: 16, b: 52 },
      xaxis: { ...axis, title: { text: vx.label } },
      yaxis: { ...axis, title: { text: vy.label }, autorange: reverseY ? "reversed" : true },
    };
    return { data: traces, layout, count: xs.length };
  }, [dataset, stations, xi, yi, zi, current, colorScale, reverseY]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewToolbar>
        <VariableSelect label="X axis" value={scatter.x} onChange={(v) => v && setScatter({ x: v })} className="w-44" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="mb-0.5"
          title="Swap X and Y"
          onClick={() => setScatter({ x: scatter.y, y: scatter.x })}
        >
          <ArrowLeftRight />
        </Button>
        <VariableSelect label="Y axis" value={scatter.y} onChange={(v) => v && setScatter({ y: v })} className="w-44" />
        <VariableSelect
          label="Colour"
          allowNone
          noneLabel="Single colour"
          value={scatter.z}
          onChange={(v) => setScatter({ z: v })}
          className="w-44"
        />
        {scatter.z && <ColorScaleSelect className="w-40" />}
        <div className="flex items-center gap-2 pb-1.5">
          <Switch
            id="revy"
            checked={reverseY}
            disabled={yi === dataset.primaryIndex}
            onCheckedChange={(v) => setScatter({ reverseY: v })}
          />
          <Label htmlFor="revy" className="text-xs">
            Reverse Y
          </Label>
        </div>
      </ViewToolbar>
      <div className="px-3 pt-2 text-xs text-muted-foreground">
        {count.toLocaleString()} samples from {stations.length} stations · current station outlined in red
      </div>
      <div className="min-h-0 flex-1 p-1">
        {count === 0 ? (
          <EmptyPlot title="Nothing to plot" body="None of the shown stations have values for both of these variables." />
        ) : (
          <Plot
            data={data}
            layout={layout}
            fileName={`scatter-${scatter.x}-vs-${scatter.y}`}
            onPointClick={(pt) => typeof pt.customdata === "number" && setCurrent(pt.customdata)}
          />
        )}
      </div>
    </div>
  );
}
