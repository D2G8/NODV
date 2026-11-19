"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FlaskConical, RotateCcw, ScanSearch, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Field, VariableSelect } from "@/components/controls";
import { FileSummaryPanel } from "@/components/import/file-summary";
import { measuredIndices, stationLabel } from "@/lib/odv/build";
import { formatDate } from "@/lib/odv/dates";
import { addDensityVariables, guessSalinity, guessTemperature } from "@/lib/odv/derived";
import { useFilteredStations, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const LIST_LIMIT = 400;

function toDateInput(ms: number | null) {
  return ms === null ? "" : new Date(ms).toISOString().slice(0, 10);
}

export function Sidebar() {
  const dataset = useStore((s) => s.dataset)!;
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const resetFilter = useStore((s) => s.resetFilter);
  const current = useStore((s) => s.current);
  const setCurrent = useStore((s) => s.setCurrent);
  const sectionStations = useStore((s) => s.section.stations);
  const stations = useFilteredStations();
  const [query, setQuery] = useState("");

  const stats = useMemo(() => {
    const cruises = [...new Set(dataset.stations.map((s) => s.cruise))].sort();
    const dates = dataset.stations.map((s) => s.date).filter((d): d is number => d !== null);
    const samples = dataset.stations.reduce((a, s) => a + s.n, 0);
    return {
      cruises,
      samples,
      first: dates.length ? Math.min(...dates) : null,
      last: dates.length ? Math.max(...dates) : null,
    };
  }, [dataset]);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? stations.filter((s) => stationLabel(s).toLowerCase().includes(q)) : stations;
  }, [stations, query]);

  const warningCount = dataset.summary.checks.filter((c) => c.level === "warning").length;
  const filterActive = filter.cruises !== null || filter.dateFrom !== null || filter.dateTo !== null || filter.bbox !== null;
  const inSection = new Set(sectionStations);

  const toggleCruise = (c: string, on: boolean) => {
    const base = filter.cruises ?? stats.cruises;
    const next = on ? [...base, c] : base.filter((x) => x !== c);
    setFilter({ cruises: next.length === stats.cruises.length ? null : next });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <section className="rounded-xl border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" title={dataset.fileName}>
              {dataset.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDate(stats.first, false)} → {formatDate(stats.last, false)}
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 uppercase">
            {dataset.format === "excel" ? "Excel" : dataset.format === "odv" ? "ODV" : "CSV"}
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Stations" value={dataset.stations.length} />
          <Stat label="Samples" value={stats.samples} />
          <Stat label="Measured" value={measuredIndices(dataset).length} />
        </div>
        <Popover>
          <PopoverTrigger
            render={
              <button className="mt-3 flex w-full items-start gap-2 rounded-md bg-sky-50 p-2 text-left text-xs text-sky-950 transition-colors hover:bg-sky-100" />
            }
          >
            <ScanSearch className="mt-0.5 size-3.5 shrink-0 text-sky-700" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{dataset.summary.kind}</span>
              <span className="block text-sky-900/70">
                {warningCount > 0 ? `${warningCount} thing${warningCount === 1 ? "" : "s"} to check · ` : ""}
                Read the file description
              </span>
            </span>
            {warningCount > 0 && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />}
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="max-h-[80vh] w-[min(28rem,90vw)] overflow-auto">
            <FileSummaryPanel summary={dataset.summary} compact />
          </PopoverContent>
        </Popover>
        <DerivedButton />
      </section>

      <section className="rounded-xl border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Station filter</h2>
          {filterActive && (
            <Button size="xs" variant="ghost" onClick={resetFilter}>
              <RotateCcw /> Reset
            </Button>
          )}
        </div>
        {stats.cruises.length > 1 && (
          <div className="mb-3 flex max-h-28 flex-col gap-1.5 overflow-auto">
            {stats.cruises.map((c) => (
              <label key={c} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={filter.cruises === null || filter.cruises.includes(c)}
                  onCheckedChange={(v) => toggleCruise(c, Boolean(v))}
                />
                <span className="truncate">{c || "(no cruise name)"}</span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {dataset.stations.filter((s) => s.cruise === c).length}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="From">
            <Input
              type="date"
              className="h-7 text-xs"
              value={toDateInput(filter.dateFrom)}
              onChange={(e) => setFilter({ dateFrom: e.target.value ? Date.parse(`${e.target.value}T00:00:00Z`) : null })}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              className="h-7 text-xs"
              value={toDateInput(filter.dateTo)}
              onChange={(e) => setFilter({ dateTo: e.target.value ? Date.parse(`${e.target.value}T23:59:59Z`) : null })}
            />
          </Field>
        </div>
        {filter.bbox && (
          <div className="mt-2 flex items-center justify-between rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-900">
            Limited to map area
            <button className="underline" onClick={() => setFilter({ bbox: null })}>
              clear
            </button>
          </div>
        )}
      </section>

      <section className="flex min-h-48 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${stations.length} stations`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {listed.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {stations.length === 0 ? "No stations match the filter." : "No stations match your search."}
            </div>
          ) : (
            <ul>
              {listed.slice(0, LIST_LIMIT).map((s) => (
                <li key={s.index}>
                  <button
                    onClick={() => setCurrent(s.index)}
                    className={cn(
                      "flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-xs hover:bg-muted/50",
                      s.index === current && "bg-red-50 hover:bg-red-50",
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        s.index === current ? "bg-red-600" : inSection.has(s.index) ? "bg-orange-500" : "bg-blue-700",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{stationLabel(s)}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{formatDate(s.date, false)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {listed.length > LIST_LIMIT && (
            <div className="p-2 text-center text-xs text-muted-foreground">
              {listed.length - LIST_LIMIT} more — search or filter to narrow down.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-1 py-1.5">
      <div className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

function DerivedButton() {
  const dataset = useStore((s) => s.dataset)!;
  const updateDataset = useStore((s) => s.updateDataset);
  const ti = guessTemperature(dataset.variables);
  const si = guessSalinity(dataset.variables);
  const [t, setT] = useState<string | null>(ti >= 0 ? dataset.variables[ti].key : null);
  const [s, setS] = useState<string | null>(si >= 0 ? dataset.variables[si].key : null);
  const [open, setOpen] = useState(false);
  if (dataset.variables.some((v) => v.derived) || measuredIndices(dataset).length < 2) return null;

  const add = () => {
    const tIdx = dataset.variables.findIndex((v) => v.key === t);
    const sIdx = dataset.variables.findIndex((v) => v.key === s);
    if (tIdx < 0 || sIdx < 0) return;
    updateDataset(addDensityVariables(dataset, tIdx, sIdx));
    setOpen(false);
    toast.success("Added potential temperature θ and potential density σθ");
  };

  return (
    <>
      <Separator className="my-3" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button size="sm" variant="outline" className="w-full" />}>
          <FlaskConical /> Add derived variables (θ, σθ)
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="flex flex-col gap-3 text-xs">
            <p className="text-muted-foreground">
              Computes potential temperature (Bryden 1973) and potential density anomaly σθ (UNESCO EOS-80). Depth in
              metres is used as pressure in dbar.
            </p>
            <VariableSelect label="Temperature" value={t} onChange={setT} />
            <VariableSelect label="Salinity" value={s} onChange={setS} />
            <Button size="sm" onClick={add} disabled={!t || !s || t === s}>
              Add variables
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
