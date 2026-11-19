"use client";

import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";
import { ListOrdered, MousePointerClick, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ColorScaleSelect, Field, SimpleSelect, VariableSelect } from "@/components/controls";
import { Plot } from "@/components/plots/plot";
import { stationLabel } from "@/lib/odv/build";
import { COLOR_SCALES } from "@/lib/odv/colormaps";
import { cumulativeDistance, stationMaxLevel } from "@/lib/odv/geo";
import { weightedAverageGrid } from "@/lib/odv/grid";
import type { Station } from "@/lib/odv/types";
import { useFilteredStations, useStore, type SectionAxis } from "@/lib/store";
import { EmptyPlot, NothingMeasured, useHasMeasurements, ViewToolbar } from "./view-chrome";

const AXIS_LABEL: Record<SectionAxis, string> = {
  distance: "Section distance [km]",
  lon: "Longitude [°E]",
  lat: "Latitude [°N]",
  time: "Date (UTC)",
};

function axisValues(stations: Station[], axis: SectionAxis) {
  if (axis === "distance") return cumulativeDistance(stations);
  if (axis === "lon") return stations.map((s) => s.lon);
  if (axis === "lat") return stations.map((s) => s.lat);
  return stations.map((s) => s.date ?? NaN);
}

function interpBottom(xs: number[], bottoms: number[], x: number) {
  if (x <= xs[0]) return bottoms[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
      return bottoms[i - 1] + f * (bottoms[i] - bottoms[i - 1]);
    }
  }
  return bottoms[bottoms.length - 1];
}

export function SectionView() {
  const dataset = useStore((s) => s.dataset)!;
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const setCurrent = useStore((s) => s.setCurrent);
  const current = useStore((s) => s.current);
  const colorScale = useStore((s) => s.colorScale);
  const filtered = useFilteredStations();
  const hasMeasurements = useHasMeasurements();

  const zi = dataset.variables.findIndex((v) => v.key === section.z);
  const p = dataset.primaryIndex;

  const sectionStations = useMemo(
    () => section.stations.map((i) => dataset.stations[i]).filter(Boolean),
    [dataset, section.stations],
  );

  const result = useMemo(() => {
    if (zi < 0 || sectionStations.length < 2) return null;
    const xsStation = axisValues(sectionStations, section.axis);
    const pts = { x: [] as number[], y: [] as number[], z: [] as number[], label: [] as string[], id: [] as number[] };
    const stationPos: { x: number; bottom: number; st: Station }[] = [];
    sectionStations.forEach((st, k) => {
      const x = xsStation[k];
      if (!Number.isFinite(x)) return;
      const P = st.data[p];
      const Z = st.data[zi];
      const label = stationLabel(st);
      for (let i = 0; i < st.n; i++) {
        if (Number.isNaN(P[i]) || Number.isNaN(Z[i])) continue;
        pts.x.push(x);
        pts.y.push(P[i]);
        pts.z.push(Z[i]);
        pts.label.push(label);
        pts.id.push(st.index);
      }
      const maxLevel = stationMaxLevel(st, p);
      stationPos.push({ x, bottom: Math.max(st.botDepth ?? -Infinity, maxLevel), st });
    });
    if (pts.z.length < 3 || stationPos.length < 2) return null;
    stationPos.sort((a, b) => a.x - b.x);
    const sx = stationPos.map((s) => s.x);
    const sb = stationPos.map((s) => s.bottom);
    const xMin = sx[0];
    const xMax = sx[sx.length - 1];
    const yMax = Math.max(...pts.y);
    const deepest = Math.max(yMax, ...sb.filter(Number.isFinite));
    // Shallow sampling over deep water (net tows, upper-ocean casts) would otherwise be squashed into a sliver.
    const plotBottom = (deepest > yMax * 1.5 ? yMax : deepest) * 1.03;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const v of pts.z) {
      if (v < zMin) zMin = v;
      if (v > zMax) zMax = v;
    }

    let grid: ReturnType<typeof weightedAverageGrid> | null = null;
    if (section.gridded) {
      grid = weightedAverageGrid({
        x: pts.x,
        y: pts.y,
        z: pts.z,
        xMin,
        xMax,
        yMin: 0,
        yMax: yMax,
        nx: 180,
        ny: 110,
        xScale: section.xScale,
        yScale: section.yScale,
        qualityLimit: section.quality,
      });
      if (section.bathymetry) {
        grid.xs.forEach((gx, i) => {
          const bottom = interpBottom(sx, sb, gx);
          grid!.ys.forEach((gy, j) => {
            if (gy > bottom) grid!.z[j][i] = null;
          });
        });
      }
    }
    return { pts, stationPos, sx, sb, xMin, xMax, plotBottom, zMin, zMax, grid };
  }, [sectionStations, section.axis, section.gridded, section.xScale, section.yScale, section.quality, section.bathymetry, zi, p]);

  const { data, layout } = useMemo(() => {
    if (!result) return { data: [], layout: {} };
    const v = dataset.variables[zi];
    const scale = COLOR_SCALES[colorScale].scale;
    const isTime = section.axis === "time";
    const traces: Partial<Data>[] = [];
    const colorbar = { title: { text: v.label, side: "right" as const }, thickness: 14, outlinewidth: 0, len: 0.9 };

    if (result.grid) {
      traces.push({
        type: "heatmap",
        x: result.grid.xs,
        y: result.grid.ys,
        z: result.grid.z,
        zmin: result.zMin,
        zmax: result.zMax,
        colorscale: scale,
        zsmooth: "best",
        colorbar,
        hovertemplate: `${v.name}: %{z:.4g}<extra></extra>`,
      } as Partial<Data>);
      if (section.contours) {
        traces.push({
          type: "contour",
          x: result.grid.xs,
          y: result.grid.ys,
          z: result.grid.z,
          showscale: false,
          hoverinfo: "skip",
          ncontours: 14,
          contours: { coloring: "none", showlabels: true, labelfont: { size: 9, color: "#1e293b" } },
          line: { color: "rgba(15,23,42,0.45)", width: 0.8, smoothing: 1 },
        } as Partial<Data>);
      }
    }
    if (section.dots || !result.grid) {
      traces.push({
        type: "scatter",
        mode: "markers",
        x: result.pts.x,
        y: result.pts.y,
        customdata: result.pts.id,
        text: result.pts.label,
        marker: result.grid
          ? { size: 2.5, color: "rgba(15,23,42,0.55)" }
          : { size: 9, symbol: "square", color: result.pts.z, colorscale: scale, cmin: result.zMin, cmax: result.zMax, showscale: true, colorbar },
        hovertemplate: result.grid
          ? `%{text}<br>%{y:.4g} ${dataset.variables[p].unit}<extra></extra>`
          : `%{text}<br>${v.name}: %{marker.color:.4g}<extra></extra>`,
      });
    }
    if (section.bathymetry) {
      const fx = [result.sx[0], ...result.sx, result.sx[result.sx.length - 1]];
      const fy = [result.plotBottom, ...result.sb, result.plotBottom];
      traces.push({
        type: "scatter",
        mode: "lines",
        x: fx,
        y: fy,
        fill: "toself",
        fillcolor: "#9ca3af",
        line: { color: "#4b5563", width: 1 },
        hoverinfo: "skip",
      });
    }
    traces.push({
      type: "scatter",
      mode: "markers",
      x: result.stationPos.map((s) => s.x),
      y: result.stationPos.map(() => 0),
      customdata: result.stationPos.map((s) => s.st.index),
      text: result.stationPos.map((s) => stationLabel(s.st)),
      cliponaxis: false,
      marker: {
        symbol: "triangle-down",
        size: result.stationPos.map((s) => (s.st.index === current ? 13 : 9)),
        color: result.stationPos.map((s) => (s.st.index === current ? "#dc2626" : "#0f172a")),
      },
      hovertemplate: "Station %{text}<extra>click to select</extra>",
    });

    const axis = { zeroline: false, showline: true, linecolor: "#475569", mirror: true, ticks: "outside" as const, showgrid: false };
    const layout: Partial<Layout> = {
      showlegend: false,
      hovermode: "closest",
      margin: { l: 64, r: 16, t: 24, b: 52 },
      plot_bgcolor: "#ffffff",
      xaxis: {
        ...axis,
        title: { text: AXIS_LABEL[section.axis] },
        type: isTime ? "date" : "linear",
        range: [result.xMin, result.xMax],
      },
      yaxis: { ...axis, title: { text: dataset.variables[p].label }, range: [result.plotBottom, 0] },
    };
    return { data: traces, layout };
  }, [result, dataset, zi, p, colorScale, section.axis, section.contours, section.dots, section.bathymetry, current]);

  const useFiltered = () => {
    const sorted = [...filtered].sort((a, b) => (a.date ?? a.index) - (b.date ?? b.index));
    setSection({ stations: sorted.map((s) => s.index), picking: false });
  };

  if (!hasMeasurements) return <NothingMeasured what="a section" />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewToolbar>
        <VariableSelect label="Variable" value={section.z} onChange={(v) => v && setSection({ z: v })} className="w-48" />
        <Field label="X axis" className="w-40">
          <SimpleSelect
            value={section.axis}
            onChange={(v) => setSection({ axis: v as SectionAxis })}
            options={(Object.keys(AXIS_LABEL) as SectionAxis[]).map((a) => ({ value: a, label: AXIS_LABEL[a].replace(/ \[.*\]| \(UTC\)/, "") }))}
          />
        </Field>
        <ColorScaleSelect className="w-40" />
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={section.picking ? "default" : "outline"}
            onClick={() => setSection(section.picking ? { picking: false } : { picking: true, stations: [] })}
          >
            <MousePointerClick /> {section.picking ? "Finish picking" : "Pick on map"}
          </Button>
          <Button size="sm" variant="outline" onClick={useFiltered} title="Use every station currently shown, ordered by date">
            <ListOrdered /> All shown
          </Button>
          <Popover>
            <PopoverTrigger render={<Button size="sm" variant="outline" />}>
              <SlidersHorizontal /> Gridding
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <SectionSettings />
            </PopoverContent>
          </Popover>
          {section.stations.length > 0 && (
            <Button size="icon-sm" variant="ghost" title="Clear section" onClick={() => setSection({ stations: [] })}>
              <Trash2 />
            </Button>
          )}
        </div>
      </ViewToolbar>
      <div className="px-3 pt-2 text-xs text-muted-foreground">
        {sectionStations.length} stations in section
        {sectionStations.length >= 2 &&
          ` · ${stationLabel(sectionStations[0])} → ${stationLabel(sectionStations[sectionStations.length - 1])}`}
        {section.gridded && ` · weighted-average gridding (${section.xScale}‰ × ${section.yScale}‰)`}
      </div>
      <div className="min-h-0 flex-1 p-1">
        {!result ? (
          <EmptyPlot
            title={sectionStations.length < 2 ? "Define a section" : "Not enough data"}
            body={
              sectionStations.length < 2
                ? "A section needs at least two stations. Click “Pick on map” and choose stations in order, or use all shown stations."
                : "The section stations don’t have enough values for this variable. Try another variable or station set."
            }
            action={
              <Button size="sm" variant="outline" onClick={useFiltered}>
                <ListOrdered /> Use all shown stations
              </Button>
            }
          />
        ) : (
          <Plot
            data={data}
            layout={layout}
            fileName={`section-${section.z}`}
            onPointClick={(pt) => typeof pt.customdata === "number" && setCurrent(pt.customdata)}
          />
        )}
      </div>
    </div>
  );
}

function SectionSettings() {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const toggles: [keyof typeof section, string][] = [
    ["gridded", "Gridded field"],
    ["contours", "Contour lines"],
    ["dots", "Sample dots"],
    ["bathymetry", "Seafloor mask"],
  ];
  return (
    <div className="flex flex-col gap-4 text-xs">
      <div className="grid grid-cols-2 gap-2">
        {toggles.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <Switch checked={Boolean(section[key])} onCheckedChange={(v) => setSection({ [key]: v })} />
            {label}
          </label>
        ))}
      </div>
      <SliderRow label="X scale length" unit="‰" min={5} max={400} step={5} value={section.xScale} onChange={(v) => setSection({ xScale: v })} />
      <SliderRow label="Y scale length" unit="‰" min={5} max={300} step={5} value={section.yScale} onChange={(v) => setSection({ yScale: v })} />
      <SliderRow label="Quality limit" unit="" min={0.01} max={2} step={0.01} value={section.quality} onChange={(v) => setSection({ quality: v })} />
      <p className="text-muted-foreground">
        Scale lengths are per mille of each axis range, as in ODV. Larger values give smoother fields; raise the quality
        limit to blank areas far from data.
      </p>
    </div>
  );
}

function SliderRow({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="tabular-nums text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
    </div>
  );
}
