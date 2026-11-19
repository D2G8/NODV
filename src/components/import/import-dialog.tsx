"use client";

import { useMemo, useState } from "react";
import { AlertCircle, FileSpreadsheet, Layers } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Field, SimpleSelect } from "@/components/controls";
import { buildDataset } from "@/lib/odv/build";
import { formatDate, parseDateCell } from "@/lib/odv/dates";
import { ROLE_LABELS, ROLE_ORDER, validateMapping } from "@/lib/odv/detect";
import type { ColumnMapping, ColumnRole } from "@/lib/odv/types";
import { useStore } from "@/lib/store";
import { useImporter } from "@/lib/use-importer";
import { cn } from "@/lib/utils";

const ROLE_TONE: Partial<Record<ColumnRole, string>> = {
  primary: "bg-sky-50 text-sky-900",
  variable: "bg-emerald-50 text-emerald-900",
  ignore: "bg-muted text-muted-foreground",
  metadata: "bg-violet-50 text-violet-900",
};

function previewCell(v: string | number, role: ColumnRole, format: string) {
  if (typeof v !== "number" || format !== "excel") return String(v);
  if (role === "date") return formatDate(parseDateCell(v, false, true), v % 1 !== 0);
  if (role === "time" && v >= 0 && v < 1) {
    const mins = Math.round(v * 1440);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  return String(v);
}

const FORMAT_LABEL = { odv: "ODV spreadsheet", csv: "Delimited text", excel: "Excel workbook" };

export function ImportDialog() {
  const pending = useStore((s) => s.pending);
  const setPending = useStore((s) => s.setPending);
  if (!pending) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <ImportBody key={`${pending.table.fileName}:${pending.table.sheetName ?? ""}`} />
      </DialogContent>
    </Dialog>
  );
}

function ImportBody() {
  const pending = useStore((s) => s.pending)!;
  const setPending = useStore((s) => s.setPending);
  const setDataset = useStore((s) => s.setDataset);
  const { openFile } = useImporter();
  const { table } = pending;
  const [mapping, setMapping] = useState<ColumnMapping>(pending.mapping);
  const [missingText, setMissingText] = useState(pending.mapping.missingValues.join(", "));

  const errors = validateMapping(mapping);
  const preview = table.rows.slice(0, 8);
  const counts = useMemo(() => {
    const vars = mapping.roles.filter((r) => r === "variable" || r === "primary").length;
    return { vars };
  }, [mapping]);

  const setRole = (col: number, role: ColumnRole) => {
    setMapping((m) => {
      const roles = [...m.roles];
      const unique = role !== "variable" && role !== "metadata" && role !== "ignore";
      if (unique) {
        const prevCol = roles.indexOf(role);
        if (prevCol >= 0 && prevCol !== col) roles[prevCol] = role === "primary" ? "variable" : "metadata";
      }
      roles[col] = role;
      return { ...m, roles };
    });
  };

  const doImport = () => {
    const missingValues = missingText
      .split(/[,;\s]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n !== 0);
    try {
      const ds = buildDataset(table, { ...mapping, missingValues });
      if (ds.stations.length === 0) {
        toast.error("No stations could be built", {
          description: "Check that latitude and longitude columns are mapped and contain decimal degrees.",
        });
        return;
      }
      setDataset(ds);
      toast.success(`Imported ${ds.stations.length} stations and ${ds.variables.length} variables`);
      for (const w of ds.warnings) toast.warning(w);
    } catch (err) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <>
      <DialogHeader className="border-b p-4 pr-12">
        <DialogTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4 text-sky-700" />
          Import {table.fileName}
          <Badge variant="secondary">{FORMAT_LABEL[table.format]}</Badge>
        </DialogTitle>
        <DialogDescription>
          Check what each column means. We guessed from the headers; change anything that looks wrong.{" "}
          {table.rows.length.toLocaleString()} rows · {table.headers.length} columns · {counts.vars} data variables selected.
        </DialogDescription>
      </DialogHeader>

      {table.notice && (
        <div className="flex items-start gap-2 border-b bg-sky-50 px-4 py-2 text-xs text-sky-900">
          <Layers className="mt-0.5 size-3.5 shrink-0" />
          {table.notice}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-4 border-b bg-muted/30 px-4 py-3">
        {table.sheetNames && table.sheetNames.length > 1 && pending.file && (
          <Field label="Worksheet" className="w-56">
            <SimpleSelect
              value={table.sheetName ?? null}
              onChange={(name) => openFile(pending.file!, { sheetName: name })}
              options={table.sheetNames.map((n) => ({ value: n, label: n }))}
            />
          </Field>
        )}
        <Field label="Missing-value codes" className="w-56">
          <Input className="h-7" value={missingText} onChange={(e) => setMissingText(e.target.value)} placeholder="-999, -9999" />
        </Field>
        <div className="flex items-center gap-2 pb-1">
          <Switch id="dayfirst" checked={mapping.dayFirst} onCheckedChange={(v) => setMapping((m) => ({ ...m, dayFirst: v }))} />
          <Label htmlFor="dayfirst" className="text-xs">
            Dates are day-first (dd/mm/yyyy)
          </Label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_var(--border)]">
            <tr>
              {table.headers.map((h, c) => (
                <th key={c} className={cn("min-w-36 border-r px-2 pt-2 pb-2 text-left align-top font-normal", ROLE_TONE[mapping.roles[c]])}>
                  <div className="mb-1.5 truncate font-semibold" title={h}>
                    {h}
                  </div>
                  <SimpleSelect
                    ariaLabel={`Role for ${h}`}
                    value={mapping.roles[c]}
                    onChange={(v) => setRole(c, v as ColumnRole)}
                    options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                    className="bg-background"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, r) => (
              <tr key={r} className="border-b">
                {row.map((v, c) => (
                  <td
                    key={c}
                    className={cn(
                      "max-w-48 truncate border-r px-2 py-1 tabular-nums",
                      mapping.roles[c] === "ignore" && "text-muted-foreground/50",
                    )}
                  >
                    {v === null ? <span className="text-muted-foreground/40">·</span> : previewCell(v, mapping.roles[c], table.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.rows.length > preview.length && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            Showing the first {preview.length} of {table.rows.length.toLocaleString()} rows.
          </div>
        )}
      </div>

      <DialogFooter className="m-0 flex-col items-stretch gap-2 rounded-b-xl border-t p-4 sm:flex-row sm:items-center">
        <div className="mr-auto text-xs">
          {errors.length > 0 ? (
            <div className="flex flex-col gap-0.5 text-destructive">
              {errors.map((e) => (
                <span key={e} className="flex items-center gap-1">
                  <AlertCircle className="size-3.5" /> {e}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">
              Rows sharing cruise, station, date and position become one station. Blank metadata cells continue the
              station above, as in ODV files.
            </span>
          )}
        </div>
        <Button variant="outline" onClick={() => setPending(null)}>
          Cancel
        </Button>
        <Button onClick={doImport} disabled={errors.length > 0}>
          Import data
        </Button>
      </DialogFooter>
    </>
  );
}
