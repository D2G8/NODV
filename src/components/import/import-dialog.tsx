"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Combine,
  FileSpreadsheet,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Split,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Field, SimpleSelect } from "@/components/controls";
import { buildDataset } from "@/lib/odv/build";
import { applyEdits, type ColumnEdit, editId, MERGE_LABELS } from "@/lib/odv/columns";
import { formatDate, parseDateCell } from "@/lib/odv/dates";
import { detectMapping, ROLE_LABELS, ROLE_ORDER, UNIQUE_ROLES, validateMapping } from "@/lib/odv/detect";
import type { ColumnMapping, ColumnRole } from "@/lib/odv/types";
import { useStore } from "@/lib/store";
import { useImporter } from "@/lib/use-importer";
import { cn } from "@/lib/utils";
import { ColumnEditorDialog, type EditorRequest } from "./column-editor";
import { FileSummaryPanel } from "./file-summary";

const ROLE_TONE: Partial<Record<ColumnRole, string>> = {
  primary: "bg-sky-50 text-sky-900",
  interval: "bg-sky-50 text-sky-900",
  intervalTop: "bg-sky-50 text-sky-900",
  intervalBottom: "bg-sky-50 text-sky-900",
  variable: "bg-emerald-50 text-emerald-900",
  ignore: "bg-muted text-muted-foreground",
  metadata: "bg-violet-50 text-violet-900",
};

const NUMERIC_ROLES = new Set<ColumnRole>(["primary", "interval", "intervalTop", "intervalBottom", "variable"]);

function previewCell(v: string | number, role: ColumnRole, format: string) {
  if (typeof v !== "number" || format !== "excel") return String(v);
  if (role === "date") return formatDate(parseDateCell(v, false, true), v % 1 !== 0);
  if (role === "time" && v >= 0 && v < 1) {
    const mins = Math.round(v * 1440);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  return String(Math.round(v * 1e6) / 1e6);
}

const FORMAT_LABEL = { odv: "ODV spreadsheet", csv: "Delimited text", excel: "Excel workbook" };

/** Roles the user picked win; detected roles fill in the rest, demoted where they would clash. */
function resolveRoles(headers: string[], detected: ColumnRole[], chosen: Record<string, ColumnRole>) {
  const roles = headers.map((h, i) => chosen[h] ?? detected[i]);
  for (const role of UNIQUE_ROLES) {
    const cols = roles.map((r, i) => (r === role ? i : -1)).filter((i) => i >= 0);
    if (cols.length < 2) continue;
    const keep = cols.find((i) => chosen[headers[i]] === role) ?? cols[0];
    for (const i of cols) if (i !== keep) roles[i] = NUMERIC_ROLES.has(role) ? "variable" : "metadata";
  }
  if (roles.includes("interval")) {
    const explicitPair = headers.some((h) => chosen[h] === "intervalTop" || chosen[h] === "intervalBottom");
    if (!explicitPair) roles.forEach((r, i) => (r === "intervalTop" || r === "intervalBottom") && (roles[i] = "variable"));
  }
  return roles;
}

function describeEdit(e: ColumnEdit) {
  if (e.op === "rename") return `Renamed “${e.column}” to “${e.name}”`;
  if (e.op === "delete") return `Deleted “${e.column}”`;
  if (e.op === "merge") return `Merged ${e.columns.map((c) => `“${c}”`).join(" + ")} into “${e.name}” (${MERGE_LABELS[e.how].toLowerCase()})`;
  const f = e.formula.trim();
  return `Added “${e.name}” ${f.startsWith("=") ? f : `= ${f || "(empty)"}`}`;
}

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

  const [edits, setEdits] = useState<ColumnEdit[]>(pending.edits);
  const [chosen, setChosen] = useState<Record<string, ColumnRole>>(() => {
    const headers = applyEdits(table, pending.edits).table.headers;
    return Object.fromEntries(headers.map((h, i) => [h, pending.mapping.roles[i] ?? "ignore"]));
  });
  const [dayFirst, setDayFirst] = useState(pending.mapping.dayFirst);
  const [missingText, setMissingText] = useState(pending.mapping.missingValues.join(", "));
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const { table: edited, problems } = useMemo(() => applyEdits(table, edits), [table, edits]);
  const detected = useMemo(() => detectMapping(edited).roles, [edited]);
  const missingValues = useMemo(
    () =>
      missingText
        .split(/[,;\s]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n !== 0),
    [missingText],
  );
  const mapping: ColumnMapping = useMemo(
    () => ({ roles: resolveRoles(edited.headers, detected, chosen), missingValues, dayFirst }),
    [edited.headers, detected, chosen, missingValues, dayFirst],
  );
  const errors = validateMapping(mapping);
  const reading = useMemo(() => {
    if (errors.length) return null;
    try {
      return buildDataset(edited, mapping).summary;
    } catch {
      return null;
    }
  }, [edited, mapping, errors.length]);

  /** Which merge/add edit produced each current column. */
  const origins = useMemo(() => {
    const map: Record<string, number> = {};
    edits.forEach((e, i) => {
      if (problems[e.id]) return;
      if (e.op === "merge" || e.op === "add") map[e.name.trim()] = i;
      else if (e.op === "rename" && map[e.column] !== undefined) {
        map[e.name.trim()] = map[e.column];
        delete map[e.column];
      } else if (e.op === "delete") delete map[e.column];
    });
    return map;
  }, [edits, problems]);

  const editorBase = useMemo(() => {
    if (!editor) return edited;
    return editor.index === null ? edited : applyEdits(table, edits.slice(0, editor.index)).table;
  }, [editor, edited, table, edits]);

  const setRole = (column: string, role: ColumnRole) => {
    setChosen((prev) => {
      const next = { ...prev };
      if (UNIQUE_ROLES.includes(role))
        for (const [k, r] of Object.entries(next))
          if (r === role && k !== column) next[k] = NUMERIC_ROLES.has(role) ? "variable" : "metadata";
      next[column] = role;
      return next;
    });
  };

  const moveRole = (from: string, to: string) =>
    setChosen((prev) => {
      if (!(from in prev)) return prev;
      const { [from]: role, ...rest } = prev;
      return { ...rest, [to]: role };
    });

  const commitRename = (column: string, raw: string) => {
    setRenaming(null);
    const name = raw.trim();
    if (!name || name === column) return;
    if (edited.headers.includes(name)) {
      toast.error(`Another column is already called “${name}”.`);
      return;
    }
    const origin = origins[column];
    setEdits((list) => {
      const own = origin !== undefined ? list[origin] : undefined;
      if (own && (own.op === "merge" || own.op === "add") && own.name.trim() === column)
        return list.map((e, i) => (i === origin ? { ...own, name } : e));
      const last = list.at(-1);
      if (last?.op === "rename" && last.name === column) return [...list.slice(0, -1), { ...last, name }];
      return [...list, { id: editId(), op: "rename", column, name }];
    });
    moveRole(column, name);
  };

  const deleteColumn = (column: string) => {
    const origin = origins[column];
    const own = origin !== undefined ? edits[origin] : undefined;
    if (own?.op === "add") setEdits((list) => list.filter((_, i) => i !== origin));
    else setEdits((list) => [...list, { id: editId(), op: "delete", column }]);
  };

  const removeEdit = (index: number) => setEdits((list) => list.filter((_, i) => i !== index));

  const saveEditor = (edit: ColumnEdit) => {
    if (!editor) return;
    if (editor.index === null) setEdits((list) => [...list, edit]);
    else {
      const old = edits[editor.index];
      setEdits((list) => list.map((e, i) => (i === editor.index ? { ...edit, id: old.id } : e)));
      if ((old.op === "merge" || old.op === "add") && (edit.op === "merge" || edit.op === "add") && old.name !== edit.name)
        moveRole(old.name, edit.name);
    }
    setEditor(null);
  };

  const openEditorFor = (index: number) => {
    const e = edits[index];
    if (e.op === "merge") setEditor({ mode: "merge", index, columns: e.columns, name: e.name, how: e.how });
    else if (e.op === "add") setEditor({ mode: "add", index, name: e.name, formula: e.formula });
  };

  const doImport = () => {
    try {
      const ds = buildDataset(edited, mapping);
      if (ds.stations.length === 0) {
        toast.error("No stations could be built", {
          description: "Check that latitude and longitude columns are mapped and contain decimal degrees.",
        });
        return;
      }
      const applied = edits.filter((e) => !problems[e.id]);
      setDataset(
        ds,
        pending.file
          ? {
              file: pending.file,
              settings: { sheetName: table.sheetName, headers: table.headers, edits: applied, mapping },
              savedId: pending.savedId ?? null,
            }
          : null,
      );
      toast.success(`Imported ${ds.stations.length} stations`, { description: ds.summary.kind });
      for (const w of ds.warnings) toast.warning(w);
    } catch (err) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const preview = edited.rows.slice(0, 8);
  const problemCount = Object.keys(problems).length;

  return (
    <>
      <DialogHeader className="border-b p-4 pr-12">
        <DialogTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4 text-sky-700" />
          Import {table.fileName}
          <Badge variant="secondary">{FORMAT_LABEL[table.format]}</Badge>
        </DialogTitle>
        <DialogDescription>
          We read the file and worked out what it contains. Merge, add, rename or delete columns and change their roles
          below; the description updates as you go. {table.rows.length.toLocaleString()} rows · {edited.headers.length}{" "}
          columns.
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
          <Switch id="dayfirst" checked={dayFirst} onCheckedChange={setDayFirst} />
          <Label htmlFor="dayfirst" className="text-xs">
            Dates are day-first (dd/mm/yyyy)
          </Label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <section className="border-b px-4 py-3">
          {reading ? (
            <FileSummaryPanel summary={reading} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Fix the column roles flagged below and a description of the file will appear here.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2 px-4 pt-3 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Columns</span>
            <Button size="sm" variant="outline" onClick={() => setEditor({ mode: "merge", index: null, columns: [] })}>
              <Combine /> Merge columns
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditor({ mode: "add", index: null })}>
              <Plus /> Add column
            </Button>
            {edits.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setEdits([])} title="Undo every column change">
                <RotateCcw /> Reset columns
              </Button>
            )}
          </div>
          {edits.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {edits.map((e, i) => (
                <li
                  key={e.id}
                  className={cn(
                    "flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs",
                    problems[e.id] ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-background",
                  )}
                  title={problems[e.id] ?? undefined}
                >
                  <span className="min-w-0 truncate">
                    {describeEdit(e)}
                    {problems[e.id] && ` (not applied: ${problems[e.id]})`}
                  </span>
                  {(e.op === "merge" || e.op === "add") && (
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-muted"
                      aria-label={`Edit: ${describeEdit(e)}`}
                      onClick={() => openEditorFor(i)}
                    >
                      <Pencil className="size-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    aria-label={`Undo: ${describeEdit(e)}`}
                    onClick={() => removeEdit(i)}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_var(--border)]">
            <tr>
              {edited.headers.map((h, c) => {
                const origin = origins[h];
                const own = origin !== undefined ? edits[origin] : undefined;
                return (
                  <th
                    key={h}
                    className={cn("min-w-40 border-r px-2 pt-2 pb-2 text-left align-top font-normal", ROLE_TONE[mapping.roles[c]])}
                  >
                    <div className="mb-1.5 flex items-center gap-1">
                      {renaming === h ? (
                        <Input
                          autoFocus
                          defaultValue={h}
                          aria-label={`New name for ${h}`}
                          className="h-6 px-1.5 text-xs font-semibold"
                          onBlur={(e) => commitRename(h, e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(h, e.currentTarget.value);
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              setRenaming(null);
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left font-semibold hover:underline"
                          title={`${h} (click to rename)`}
                          onClick={() => setRenaming(h)}
                        >
                          {h}
                        </button>
                      )}
                      {own?.op === "merge" && (
                        <Badge variant="outline" className="h-4 shrink-0 bg-background px-1 text-[10px]">
                          merged
                        </Badge>
                      )}
                      {own?.op === "add" && (
                        <Badge variant="outline" className="h-4 shrink-0 bg-background px-1 text-[10px]">
                          added
                        </Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button size="icon-xs" variant="ghost" className="shrink-0" aria-label={`Column options for ${h}`} />}
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => setRenaming(h)}>
                            <Pencil /> Rename
                          </DropdownMenuItem>
                          {own ? (
                            <DropdownMenuItem onClick={() => openEditorFor(origin!)}>
                              {own.op === "merge" ? <Combine /> : <Plus />} Edit {own.op === "merge" ? "merge" : "value or formula"}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => setEditor({ mode: "merge", index: null, columns: [h] })}>
                            <Combine /> Merge with other columns…
                          </DropdownMenuItem>
                          {own?.op === "merge" && (
                            <DropdownMenuItem onClick={() => removeEdit(origin!)}>
                              <Split /> Split back into {own.columns.length} columns
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => deleteColumn(h)}>
                            <Trash2 /> Delete column
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <SimpleSelect
                      ariaLabel={`Role for ${h}`}
                      value={mapping.roles[c]}
                      onChange={(v) => setRole(h, v as ColumnRole)}
                      options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                      className="bg-background"
                    />
                  </th>
                );
              })}
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
        {edited.headers.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-muted-foreground">
            Every column has been deleted.
            <Button size="sm" variant="outline" onClick={() => setEdits([])}>
              <Undo2 /> Undo column changes
            </Button>
          </div>
        )}
        {edited.rows.length > preview.length && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            Showing the first {preview.length} of {edited.rows.length.toLocaleString()} rows.
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
          ) : problemCount > 0 ? (
            <span className="flex items-center gap-1 text-amber-700">
              <AlertCircle className="size-3.5" /> {problemCount} column change{problemCount === 1 ? "" : "s"} couldn’t be
              applied and will be skipped.
            </span>
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

      <ColumnEditorDialog request={editor} base={editorBase} onClose={() => setEditor(null)} onSave={saveEditor} />
    </>
  );
}
