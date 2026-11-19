"use client";

import { FileSpreadsheet, FileText, Lock, Map as MapIcon, Mountain, ScatterChart, Sigma, Upload, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecentLibrary } from "@/components/library";
import { ACCEPT_ATTR, SAMPLES, useImporter } from "@/lib/use-importer";

const FEATURES = [
  { icon: MapIcon, title: "Station map", body: "Every cast on an ocean basemap. Colour stations by any variable at a chosen depth." },
  { icon: Waves, title: "Station profiles", body: "Profiles of the selected station drawn over all other stations, as in ODV." },
  { icon: ScatterChart, title: "Property plots", body: "T–S diagrams and any X/Y pair, coloured by a third variable." },
  { icon: Mountain, title: "Sections", body: "Weighted-average gridded sections with contours and a seafloor mask." },
  { icon: Sigma, title: "Derived variables", body: "Potential temperature and potential density σθ from T and S." },
  { icon: FileText, title: "Export to ODV", body: "Save any selection as an ODV spreadsheet, Excel workbook or CSV." },
];

export function Landing() {
  const { openFile, loadSample } = useImporter();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-900">
          ODV-style analysis, in the browser
        </span>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Explore ocean profile data from ODV files <span className="text-sky-700">and Excel spreadsheets</span>
        </h1>
        <p className="max-w-2xl text-balance text-muted-foreground">
          Drop in ODV spreadsheet .txt files, CSV, or the Excel workbooks your field team already keeps. Map stations, plot
          profiles and T–S diagrams, and draw gridded sections without installing anything.
        </p>
      </div>

      <label className="group relative flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-sky-300 bg-gradient-to-b from-sky-50 to-white px-6 py-12 text-center transition-colors focus-within:border-sky-500 focus-within:ring-3 focus-within:ring-sky-200 hover:border-sky-500 hover:bg-sky-50">
        <div className="rounded-full bg-white p-3 shadow-sm ring-1 ring-sky-200">
          <Upload className="size-6 text-sky-700" />
        </div>
        <div className="text-lg font-medium">Drop a data file here, or click to browse</div>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground group-hover:bg-primary/90">
          <Upload className="size-4" /> Choose a file
        </span>
        <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
          {["ODV spreadsheet .txt", ".csv / .tsv", ".xlsx", ".xls", ".ods"].map((f) => (
            <span key={f} className="rounded-md bg-white px-2 py-0.5 ring-1 ring-border">
              {f}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" /> Files are read in your browser. Nothing is uploaded unless you save it to your library.
        </div>
        <input
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          aria-label="Choose a data file to import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openFile(f);
            e.target.value = "";
          }}
        />
      </label>

      <RecentLibrary />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">No data to hand? Try a sample</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <div key={s.url} className="flex items-start gap-3 rounded-xl border bg-card p-4">
              <div className="rounded-lg bg-muted p-2">
                {s.format.startsWith("Excel") ? (
                  <FileSpreadsheet className="size-5 text-emerald-700" />
                ) : (
                  <FileText className="size-5 text-sky-700" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-muted-foreground">{s.description}</div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => loadSample(s.url, s.name)}>
                    Open sample
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => loadSample(s.url, s.name, true)}>
                    Review columns first
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex gap-3">
            <f.icon className="mt-0.5 size-4 shrink-0 text-sky-700" />
            <div>
              <div className="text-sm font-medium">{f.title}</div>
              <div className="text-xs text-muted-foreground">{f.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
