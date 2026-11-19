"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { buildDataset } from "./odv/build";
import { detectMapping, validateMapping } from "./odv/detect";
import { readFile } from "./odv/read";
import { useStore } from "./store";

const ACCEPTED = /\.(txt|csv|tsv|tab|dat|xlsx|xlsm|xlsb|xls|ods)$/i;

export const ACCEPT_ATTR = ".txt,.csv,.tsv,.tab,.dat,.xlsx,.xlsm,.xlsb,.xls,.ods";

export function useImporter() {
  const setPending = useStore((s) => s.setPending);
  const setLoading = useStore((s) => s.setLoading);
  const setDataset = useStore((s) => s.setDataset);

  const openFile = useCallback(
    async (file: File, opts: { skipDialog?: boolean; sheetName?: string } = {}) => {
      if (!ACCEPTED.test(file.name)) {
        toast.error(`“${file.name}” isn’t a supported file`, {
          description: "Use ODV spreadsheet .txt, CSV/TSV, or Excel (.xlsx, .xls, .ods).",
        });
        return;
      }
      setLoading(`Reading ${file.name}…`);
      try {
        const table = await readFile(file, opts.sheetName);
        if (table.rows.length === 0) throw new Error("No data rows were found below the header row.");
        const mapping = detectMapping(table);
        if (opts.skipDialog && validateMapping(mapping).length === 0) {
          const ds = buildDataset(table, mapping);
          if (ds.stations.length === 0) throw new Error("No stations with valid positions were found.");
          setDataset(ds);
          toast.success(`Loaded ${ds.stations.length} stations from ${file.name}`);
        } else {
          setPending({ table, mapping, file });
        }
      } catch (err) {
        toast.error(`Couldn’t read ${file.name}`, { description: err instanceof Error ? err.message : String(err) });
      } finally {
        setLoading(null);
      }
    },
    [setDataset, setLoading, setPending],
  );

  const loadSample = useCallback(
    async (url: string, name: string, showDialog = false) => {
      setLoading(`Loading ${name}…`);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const file = new File([await res.blob()], name);
        await openFile(file, { skipDialog: !showDialog });
      } catch (err) {
        setLoading(null);
        toast.error("Couldn’t load the sample dataset", { description: err instanceof Error ? err.message : String(err) });
      }
    },
    [openFile, setLoading],
  );

  return { openFile, loadSample };
}

export const SAMPLES = [
  {
    url: "/samples/atlantic-transect.odv.txt",
    name: "atlantic-transect.odv.txt",
    title: "Atlantic meridional transect",
    description: "26 CTD/bottle stations, 49°N → 46°S, in ODV spreadsheet format.",
    format: "ODV .txt",
  },
  {
    url: "/samples/lisbon-coastal-survey.xlsx",
    name: "lisbon-coastal-survey.xlsx",
    title: "Lisbon coast & Tagus estuary survey",
    description: "3 seasonal surveys × 9 sites, a typical field-team Excel workbook.",
    format: "Excel .xlsx",
  },
];
