"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { guessSalinity, guessTemperature } from "./odv/derived";
import type { ColorScaleId } from "./odv/colormaps";
import type { ColumnMapping, Dataset, RawTable, Station } from "./odv/types";

export type ViewId = "station" | "scatter" | "section" | "table";
export type SectionAxis = "distance" | "lon" | "lat" | "time";

export interface StationFilter {
  cruises: string[] | null;
  dateFrom: number | null;
  dateTo: number | null;
  bbox: [number, number, number, number] | null;
}

export interface PendingImport {
  table: RawTable;
  mapping: ColumnMapping;
  file: File | null;
}

interface State {
  dataset: Dataset | null;
  pending: PendingImport | null;
  loading: string | null;
  current: number | null;
  filter: StationFilter;
  view: ViewId;
  colorScale: ColorScaleId;

  stationVars: string[];
  showAllProfiles: boolean;

  scatter: { x: string; y: string; z: string | null; reverseY: boolean };

  section: {
    stations: number[];
    picking: boolean;
    axis: SectionAxis;
    z: string;
    xScale: number;
    yScale: number;
    quality: number;
    contours: boolean;
    dots: boolean;
    bathymetry: boolean;
    gridded: boolean;
  };

  mapColor: { variable: string | null; level: number };

  setDataset: (ds: Dataset) => void;
  updateDataset: (ds: Dataset) => void;
  clearDataset: () => void;
  setPending: (p: PendingImport | null) => void;
  setLoading: (l: string | null) => void;
  setCurrent: (i: number | null) => void;
  setFilter: (f: Partial<StationFilter>) => void;
  resetFilter: () => void;
  setView: (v: ViewId) => void;
  setColorScale: (c: ColorScaleId) => void;
  setStationVars: (v: string[]) => void;
  setShowAllProfiles: (v: boolean) => void;
  setScatter: (s: Partial<State["scatter"]>) => void;
  setSection: (s: Partial<State["section"]>) => void;
  toggleSectionStation: (i: number) => void;
  setMapColor: (m: Partial<State["mapColor"]>) => void;
}

const EMPTY_FILTER: StationFilter = { cruises: null, dateFrom: null, dateTo: null, bbox: null };

function defaultsFor(ds: Dataset) {
  const vars = ds.variables;
  const nonPrimary = vars.filter((_, i) => i !== ds.primaryIndex);
  const tIdx = guessTemperature(vars);
  const sIdx = guessSalinity(vars);
  const first = nonPrimary[0]?.key ?? vars[0].key;
  const second = nonPrimary[1]?.key ?? first;
  const primaryKey = vars[ds.primaryIndex].key;

  const defaultSection = [...ds.stations]
    .filter((s) => s.cruise === ds.stations[0]?.cruise)
    .sort((a, b) => (a.date ?? a.index) - (b.date ?? b.index))
    .map((s) => s.index);

  return {
    stationVars: nonPrimary.slice(0, 4).map((v) => v.key),
    scatter: {
      x: sIdx >= 0 ? vars[sIdx].key : first,
      y: tIdx >= 0 ? vars[tIdx].key : second,
      z: primaryKey,
      reverseY: false,
    },
    sectionZ: tIdx >= 0 ? vars[tIdx].key : first,
    section: defaultSection.length >= 2 ? defaultSection : ds.stations.map((s) => s.index),
  };
}

export const useStore = create<State>((set) => ({
  dataset: null,
  pending: null,
  loading: null,
  current: null,
  filter: EMPTY_FILTER,
  view: "station",
  colorScale: "odv",
  stationVars: [],
  showAllProfiles: true,
  scatter: { x: "", y: "", z: null, reverseY: false },
  section: {
    stations: [],
    picking: false,
    axis: "distance",
    z: "",
    xScale: 60,
    yScale: 40,
    quality: 0.3,
    contours: true,
    dots: true,
    bathymetry: true,
    gridded: true,
  },
  mapColor: { variable: null, level: 10 },

  setDataset: (ds) => {
    const d = defaultsFor(ds);
    set((s) => ({
      dataset: ds,
      pending: null,
      loading: null,
      current: ds.stations[0]?.index ?? null,
      filter: EMPTY_FILTER,
      stationVars: d.stationVars,
      scatter: d.scatter,
      section: { ...s.section, stations: d.section, z: d.sectionZ, picking: false },
      mapColor: { variable: null, level: 10 },
    }));
  },
  updateDataset: (ds) => set({ dataset: ds }),
  clearDataset: () => set({ dataset: null, current: null, filter: EMPTY_FILTER }),
  setPending: (pending) => set({ pending }),
  setLoading: (loading) => set({ loading }),
  setCurrent: (current) => set({ current }),
  setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
  resetFilter: () => set({ filter: EMPTY_FILTER }),
  setView: (view) => set({ view }),
  setColorScale: (colorScale) => set({ colorScale }),
  setStationVars: (stationVars) => set({ stationVars }),
  setShowAllProfiles: (showAllProfiles) => set({ showAllProfiles }),
  setScatter: (p) => set((s) => ({ scatter: { ...s.scatter, ...p } })),
  setSection: (p) => set((s) => ({ section: { ...s.section, ...p } })),
  toggleSectionStation: (i) =>
    set((s) => {
      const has = s.section.stations.includes(i);
      return {
        section: {
          ...s.section,
          stations: has ? s.section.stations.filter((x) => x !== i) : [...s.section.stations, i],
        },
      };
    }),
  setMapColor: (p) => set((s) => ({ mapColor: { ...s.mapColor, ...p } })),
}));

export function passesFilter(st: Station, f: StationFilter) {
  if (f.cruises && !f.cruises.includes(st.cruise)) return false;
  if (f.dateFrom !== null && (st.date === null || st.date < f.dateFrom)) return false;
  if (f.dateTo !== null && (st.date === null || st.date > f.dateTo)) return false;
  if (f.bbox) {
    const [w, s, e, n] = f.bbox;
    if (st.lat < s || st.lat > n) return false;
    if (w <= e ? st.lon < w || st.lon > e : st.lon < w && st.lon > e) return false;
  }
  return true;
}

export function useFilteredStations(): Station[] {
  const dataset = useStore((s) => s.dataset);
  const filter = useStore((s) => s.filter);
  return useMemo(
    () => (dataset ? dataset.stations.filter((st) => passesFilter(st, filter)) : []),
    [dataset, filter],
  );
}

export function useVarIndex(key: string | null) {
  const dataset = useStore((s) => s.dataset);
  if (!dataset || !key) return -1;
  return dataset.variables.findIndex((v) => v.key === key);
}
