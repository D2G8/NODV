"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { stationLabel } from "@/lib/odv/build";
import { COLOR_SCALES, sampleScale } from "@/lib/odv/colormaps";
import { formatDate } from "@/lib/odv/dates";
import { useFilteredStations, useStore } from "@/lib/store";

export interface MapApi {
  getBounds: () => [number, number, number, number];
}

function FitToData({ bounds, fitKey }: { bounds: L.LatLngBounds | null; fitKey: string }) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (bounds && fitted.current !== fitKey) {
      fitted.current = fitKey;
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 9 });
    }
  }, [map, bounds, fitKey]);
  return null;
}

function ExposeApi({ onReady }: { onReady?: (api: MapApi) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady?.({
      getBounds: () => {
        const b = map.getBounds();
        return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      },
    });
  }, [map, onReady]);
  return null;
}

function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export function StationMap({
  onReady,
  values,
  colorRange,
}: {
  onReady?: (api: MapApi) => void;
  values: Map<number, number> | null;
  colorRange: [number, number] | null;
}) {
  const dataset = useStore((s) => s.dataset);
  const current = useStore((s) => s.current);
  const setCurrent = useStore((s) => s.setCurrent);
  const section = useStore((s) => s.section);
  const toggleSectionStation = useStore((s) => s.toggleSectionStation);
  const view = useStore((s) => s.view);
  const mapColor = useStore((s) => s.mapColor);
  const colorScale = useStore((s) => s.colorScale);
  const stations = useFilteredStations();

  const bounds = useMemo(() => {
    if (!dataset || dataset.stations.length === 0) return null;
    const lats = dataset.stations.map((s) => s.lat);
    const lons = dataset.stations.map((s) => s.lon);
    return L.latLngBounds([Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]).pad(0.08);
  }, [dataset]);

  const colorIdx = dataset && mapColor.variable ? dataset.variables.findIndex((v) => v.key === mapColor.variable) : -1;

  if (!dataset) return null;
  const sectionSet = new Set(section.stations);
  const showSection = view === "section" || section.picking;
  const sectionLine = section.stations
    .map((i) => dataset.stations[i])
    .filter(Boolean)
    .map((s) => [s.lat, s.lon] as [number, number]);
  const scale = COLOR_SCALES[colorScale].scale;

  const colorFor = (v: number | undefined) => {
    if (v === undefined || Number.isNaN(v) || !colorRange) return null;
    const [lo, hi] = colorRange;
    return sampleScale(scale, (v - lo) / (hi - lo || 1));
  };

  return (
    <MapContainer
      center={[20, -20]}
      zoom={2}
      minZoom={1}
      worldCopyJump
      preferCanvas
      className="h-full w-full"
      attributionControl
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Esri, GEBCO, NOAA, Garmin, HERE"
        maxNativeZoom={13}
        maxZoom={16}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={13}
        maxZoom={16}
      />
      <FitToData bounds={bounds} fitKey={`${dataset.fileName}:${dataset.stations.length}`} />
      <ExposeApi onReady={onReady} />
      <InvalidateOnResize />
      {showSection && sectionLine.length > 1 && (
        <Polyline positions={sectionLine} pathOptions={{ color: "#f97316", weight: 2.5, dashArray: "6 4" }} />
      )}
      {stations.map((s) => {
        const isCurrent = s.index === current;
        const inSection = showSection && sectionSet.has(s.index);
        const v = values?.get(s.index);
        const fill = colorFor(v) ?? (values ? "#cbd5e1" : inSection ? "#f97316" : "#1d4ed8");
        return (
          <CircleMarker
            key={s.index}
            center={[s.lat, s.lon]}
            radius={isCurrent ? 8 : values ? 6 : 4.5}
            pathOptions={{
              color: isCurrent ? "#dc2626" : inSection ? "#c2410c" : "#ffffff",
              weight: isCurrent ? 3 : 1,
              fillColor: fill,
              fillOpacity: 0.95,
            }}
            eventHandlers={{
              click: () => {
                if (section.picking) toggleSectionStation(s.index);
                else setCurrent(s.index);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <div className="text-xs">
                <div className="font-semibold">{stationLabel(s)}</div>
                <div>{formatDate(s.date)}</div>
                <div>
                  {s.lat.toFixed(3)}°, {s.lon.toFixed(3)}°
                </div>
                {values && colorIdx >= 0 && (
                  <div>
                    {dataset.variables[colorIdx].name} @ {mapColor.level}:{" "}
                    {v === undefined || Number.isNaN(v) ? "no data" : v.toPrecision(4)}
                  </div>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
