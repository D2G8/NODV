"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  Mountain,
  PanelLeft,
  Ruler,
  ScatterChart,
  Table2,
  Upload,
  Waves,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ImportDialog } from "@/components/import/import-dialog";
import { Landing } from "@/components/landing";
import { MapPanel } from "@/components/map/map-panel";
import { Sidebar } from "@/components/sidebar";
import { ScatterView } from "@/components/views/scatter-view";
import { IntervalView } from "@/components/views/interval-view";
import { SectionView } from "@/components/views/section-view";
import { StationView } from "@/components/views/station-view";
import { TableView } from "@/components/views/table-view";
import { exportCsv, exportOdvSpreadsheet, exportXlsx } from "@/lib/odv/export";
import { useFilteredStations, useStore, type ViewId } from "@/lib/store";
import { ACCEPT_ATTR, SAMPLES, useImporter } from "@/lib/use-importer";
import { cn } from "@/lib/utils";

const VIEWS: { id: ViewId; label: string; icon: typeof Waves }[] = [
  { id: "station", label: "Profiles", icon: Waves },
  { id: "scatter", label: "Scatter", icon: ScatterChart },
  { id: "section", label: "Section", icon: Mountain },
  { id: "intervals", label: "Sampling intervals", icon: Ruler },
  { id: "table", label: "Data", icon: Table2 },
];

export function AppShell() {
  const dataset = useStore((s) => s.dataset);
  const loading = useStore((s) => s.loading);
  const { openFile } = useImporter();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragDepth.current++;
      setDragging(true);
    };
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) openFile(f);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [openFile]);

  return (
    <div className={cn("flex flex-col bg-slate-50", dataset ? "min-h-dvh lg:h-dvh" : "min-h-dvh")}>
      <Header />
      {dataset ? <Workspace /> : <Landing />}
      <ImportDialog />
      {loading && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm shadow-lg ring-1 ring-black/5">
            <Loader2 className="size-4 animate-spin text-sky-700" /> {loading}
          </div>
        </div>
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[2000] flex items-center justify-center bg-sky-900/20 p-6">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-sky-500 bg-white/95 px-10 py-8 text-center shadow-xl">
            <Upload className="size-7 text-sky-700" />
            <div className="font-medium">Drop to import</div>
            <div className="text-xs text-muted-foreground">ODV .txt, CSV or Excel</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header() {
  const dataset = useStore((s) => s.dataset);
  const clearDataset = useStore((s) => s.clearDataset);
  const stations = useFilteredStations();
  const { openFile, loadSample } = useImporter();
  const [sheetOpen, setSheetOpen] = useState(false);

  const runExport = async (fn: typeof exportCsv | typeof exportXlsx, label: string) => {
    if (!dataset) return;
    if (stations.length === 0) {
      toast.error("No stations to export", { description: "Your filter hides every station." });
      return;
    }
    await fn(dataset, stations);
    toast.success(`Exported ${stations.length} stations as ${label}`);
  };

  return (
    <header className="sticky top-0 z-[1100] flex h-14 shrink-0 items-center gap-2 border-b bg-white/90 px-3 backdrop-blur sm:px-4">
      {dataset && (
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setSheetOpen(true)} aria-label="Stations and filters">
          <PanelLeft />
        </Button>
      )}
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-600 to-teal-500 text-white shadow-sm">
          <Waves className="size-4.5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Ocean Data Explorer</div>
          <div className="hidden text-[11px] text-muted-foreground sm:block">ODV-style profiles, sections & plots</div>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <label
          className={cn(
            buttonVariants({ size: "sm", variant: dataset ? "outline" : "default" }),
            "cursor-pointer focus-within:ring-3 focus-within:ring-ring/50",
          )}
        >
          <input
            type="file"
            accept={ACCEPT_ATTR}
            className="sr-only"
            aria-label="Open a data file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openFile(f);
              e.target.value = "";
            }}
          />
          <FolderOpen /> <span className="hidden sm:inline">Open file</span>
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="ghost" />}>Samples</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Sample datasets</DropdownMenuLabel>
              {SAMPLES.map((s) => (
                <DropdownMenuItem key={s.url} onClick={() => loadSample(s.url, s.name)}>
                  {s.format.startsWith("Excel") ? <FileSpreadsheet /> : <FileText />}
                  <div className="flex flex-col">
                    <span>{s.title}</span>
                    <span className="text-xs text-muted-foreground">{s.format}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {dataset && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" />}>
                <Download /> <span className="hidden sm:inline">Export</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Export {stations.length} shown stations</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => runExport(exportOdvSpreadsheet, "ODV spreadsheet")}>
                    <FileText /> ODV spreadsheet (.txt)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runExport(exportXlsx, "Excel workbook")}>
                    <FileSpreadsheet /> Excel workbook (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runExport(exportCsv, "CSV")}>
                    <Table2 /> CSV (.csv)
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  To save a plot as PNG, use the camera icon on the plot.
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="icon-sm" variant="ghost" onClick={clearDataset} aria-label="Close dataset" title="Close dataset">
              <X />
            </Button>
          </>
        )}
      </div>
      {dataset && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="left" className="w-[88vw] max-w-sm bg-slate-50 p-3">
            <SheetHeader className="p-0 pb-2">
              <SheetTitle>Stations & filters</SheetTitle>
            </SheetHeader>
            <Sidebar />
          </SheetContent>
        </Sheet>
      )}
    </header>
  );
}

function Workspace() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const current = useStore((s) => s.current);
  const setCurrent = useStore((s) => s.setCurrent);
  const hasIntervals = useStore((s) => s.dataset?.interval !== undefined);
  const stations = useFilteredStations();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [role=slider], [role=listbox], [contenteditable=true]") || t.isContentEditable)) return;
      if (stations.length === 0) return;
      const pos = stations.findIndex((s) => s.index === current);
      const next = e.key === "ArrowRight" ? (pos + 1) % stations.length : (pos - 1 + stations.length) % stations.length;
      setCurrent(stations[pos < 0 ? 0 : next].index);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stations, current, setCurrent]);

  return (
    <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 lg:block">
        <Sidebar />
      </aside>
      <main className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,2fr)_minmax(0,3fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:grid-rows-1">
        <div className="h-[340px] min-h-0 sm:h-[420px] lg:h-auto lg:min-h-[300px]">
          <MapPanel />
        </div>
        <div className="flex h-[640px] min-h-0 flex-col overflow-hidden rounded-xl border bg-card lg:h-auto lg:min-h-[420px]">
          <nav className="flex gap-1 overflow-x-auto border-b px-2 pt-2" role="tablist" aria-label="Views">
            {VIEWS.filter((v) => v.id !== "intervals" || hasIntervals).map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  view === v.id
                    ? "border-border bg-card font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <v.icon className="size-4" />
                {v.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1">
            {view === "station" && <StationView />}
            {view === "scatter" && <ScatterView />}
            {view === "section" && <SectionView />}
            {view === "intervals" && <IntervalView />}
            {view === "table" && <TableView />}
          </div>
        </div>
      </main>
    </div>
  );
}
