"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef } from "react";
import { Crop, Loader2, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VariableSelect } from "@/components/controls";
import { COLOR_SCALES, cssGradient } from "@/lib/odv/colormaps";
import { valueAtLevel } from "@/lib/odv/geo";
import { useFilteredStations, useStore } from "@/lib/store";
import type { MapApi } from "./station-map";

const StationMap = dynamic(() => import("./station-map").then((m) => m.StationMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-sky-50 text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> Loading map…
    </div>
  ),
});

export function MapPanel() {
  const dataset = useStore((s) => s.dataset)!;
  const stations = useFilteredStations();
  const mapColor = useStore((s) => s.mapColor);
  const setMapColor = useStore((s) => s.setMapColor);
  const setFilter = useStore((s) => s.setFilter);
  const filter = useStore((s) => s.filter);
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const colorScale = useStore((s) => s.colorScale);
  const api = useRef<MapApi | null>(null);
  const onReady = useCallback((a: MapApi) => {
    api.current = a;
  }, []);

  const colorIdx = mapColor.variable ? dataset.variables.findIndex((v) => v.key === mapColor.variable) : -1;
  const { values, range } = useMemo(() => {
    if (colorIdx < 0) return { values: null, range: null };
    const values = new Map(stations.map((s) => [s.index, valueAtLevel(s, dataset.primaryIndex, colorIdx, mapColor.level)]));
    const finite = [...values.values()].filter((v) => Number.isFinite(v));
    const range: [number, number] | null = finite.length ? [Math.min(...finite), Math.max(...finite)] : null;
    return { values, range };
  }, [dataset, stations, colorIdx, mapColor.level]);

  const primary = dataset.variables[dataset.primaryIndex];
  const withData = values ? [...values.values()].filter(Number.isFinite).length : 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-end gap-2 border-b px-3 py-2">
        <div className="mr-auto">
          <div className="text-sm font-semibold">Station map</div>
          <div className="text-xs text-muted-foreground">
            {stations.length} of {dataset.stations.length} stations shown
          </div>
        </div>
        <VariableSelect
          label="Colour by"
          allowNone
          noneLabel="Station positions"
          value={mapColor.variable}
          onChange={(v) => setMapColor({ variable: v })}
          className="w-44"
        />
        {mapColor.variable && (
          <label className="flex w-24 flex-col gap-1">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              at {primary.unit || primary.name}
            </span>
            <Input
              type="number"
              className="h-7"
              value={mapColor.level}
              min={0}
              onChange={(e) => setMapColor({ level: Number(e.target.value) || 0 })}
            />
          </label>
        )}
        <Button
          size="sm"
          variant={filter.bbox ? "secondary" : "outline"}
          onClick={() => (filter.bbox ? setFilter({ bbox: null }) : api.current && setFilter({ bbox: api.current.getBounds() }))}
          title="Only keep stations inside the current map view"
        >
          <Crop /> {filter.bbox ? "Clear area" : "Use map area"}
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <StationMap onReady={onReady} values={values} colorRange={range} />
        {section.picking && (
          <div className="absolute top-2 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            <MousePointerClick className="size-3.5" />
            Click stations in order to build the section ({section.stations.length})
            <button className="ml-1 rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30" onClick={() => setSection({ picking: false })}>
              Done
            </button>
          </div>
        )}
        {values && (
          <div className="absolute right-2 bottom-6 z-[1000] w-52 rounded-lg bg-white/95 p-2 text-[11px] shadow-md ring-1 ring-black/5">
            <div className="mb-1 truncate font-medium">
              {dataset.variables[colorIdx].label} @ {mapColor.level} {primary.unit}
            </div>
            {range ? (
              <>
                <div className="h-2.5 rounded-sm" style={{ background: cssGradient(COLOR_SCALES[colorScale].scale) }} />
                <div className="mt-0.5 flex justify-between tabular-nums text-muted-foreground">
                  <span>{range[0].toPrecision(4)}</span>
                  <span>{range[1].toPrecision(4)}</span>
                </div>
              </>
            ) : null}
            <div className="mt-0.5 text-muted-foreground">
              {withData} of {stations.length} stations have data at this level
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
