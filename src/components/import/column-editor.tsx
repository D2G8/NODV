"use client";

import { useMemo, useState } from "react";
import { Columns3, Combine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, SimpleSelect } from "@/components/controls";
import {
  applyEdits,
  type ColumnEdit,
  editId,
  MERGE_HINTS,
  MERGE_LABELS,
  type MergeHow,
  suggestMergeName,
} from "@/lib/odv/columns";
import type { RawCell, RawTable } from "@/lib/odv/types";
import { cn } from "@/lib/utils";

export type EditorRequest =
  | { mode: "merge"; index: number | null; columns: string[]; name?: string; how?: MergeHow }
  | { mode: "add"; index: number | null; name?: string; formula?: string };

const BOUND_WORD = /\b(from|to|top|bottom|min|max|start|end|upper|lower|shallow|deep|open|close)\b/i;
const DEPTH_WORD = /depth|pressure|\bz\b|interval/i;

function isNumericColumn(table: RawTable, name: string) {
  const c = table.headers.indexOf(name);
  const values = table.rows.slice(0, 200).map((r) => r[c]).filter((v) => v !== null);
  return values.length > 0 && values.filter((v) => typeof v === "number" || Number.isFinite(Number(v))).length / values.length >= 0.8;
}

function guessHow(columns: string[], table: RawTable): MergeHow {
  if (columns.length === 2 && columns.every((c) => BOUND_WORD.test(c)) && DEPTH_WORD.test(columns.join(" "))) return "interval";
  if (columns.length >= 2 && columns.every((c) => isNumericColumn(table, c))) {
    return DEPTH_WORD.test(columns.join(" ")) && columns.length === 2 ? "interval" : "mean";
  }
  return "join";
}

function sampleValues(table: RawTable, name: string, n = 4) {
  const c = table.headers.indexOf(name);
  if (c < 0) return [];
  const out: RawCell[] = [];
  for (const r of table.rows) {
    if (r[c] !== null) out.push(r[c]);
    if (out.length >= n) break;
  }
  return out;
}

const show = (v: RawCell) => (typeof v === "number" ? String(Math.round(v * 10000) / 10000) : String(v));

/** Dialog for creating or changing a merge or an added column. `base` is the table just before this edit. */
export function ColumnEditorDialog({
  request,
  base,
  onClose,
  onSave,
}: {
  request: EditorRequest | null;
  base: RawTable;
  onClose: () => void;
  onSave: (edit: ColumnEdit) => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-lg">
        {request?.mode === "merge" && (
          <MergeForm key={`m${request.index}`} request={request} base={base} onClose={onClose} onSave={onSave} />
        )}
        {request?.mode === "add" && (
          <AddForm key={`a${request.index}`} request={request} base={base} onClose={onClose} onSave={onSave} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MergeForm({
  request,
  base,
  onClose,
  onSave,
}: {
  request: Extract<EditorRequest, { mode: "merge" }>;
  base: RawTable;
  onClose: () => void;
  onSave: (edit: ColumnEdit) => void;
}) {
  const [columns, setColumns] = useState<string[]>(request.columns.filter((c) => base.headers.includes(c)));
  const [name, setName] = useState(request.name ?? suggestMergeName(request.columns));
  const [nameTouched, setNameTouched] = useState(request.name !== undefined);
  const [how, setHow] = useState<MergeHow>(request.how ?? guessHow(request.columns, base));
  const [howTouched, setHowTouched] = useState(request.how !== undefined);

  const toggle = (col: string, on: boolean) => {
    const next = base.headers.filter((h) => (h === col ? on : columns.includes(h)));
    setColumns(next);
    if (!nameTouched) setName(suggestMergeName(next));
    if (!howTouched) setHow(guessHow(next, base));
  };

  const result = useMemo(
    () => applyEdits(base, [{ id: "preview", op: "merge", columns, name: name.trim(), how }]),
    [base, columns, name, how],
  );
  const problem = result.problems.preview;
  const preview = problem ? [] : sampleValues(result.table, name.trim(), 5);

  const save = () => {
    if (problem) return;
    onSave({ id: editId(), op: "merge", columns, name: name.trim(), how });
  };

  return (
    <>
      <DialogHeader className="border-b p-4 pr-12">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Combine className="size-4 text-sky-700" /> {request.index === null ? "Merge columns" : "Edit merged column"}
        </DialogTitle>
        <DialogDescription>
          Combine two or more columns into one. The originals are replaced by the merged column; undo the merge at any
          time to get them back.
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Columns to merge ({columns.length} selected)
          </Label>
          <div className="flex max-h-56 flex-col overflow-auto rounded-md border">
            {base.headers.map((h) => {
              const on = columns.includes(h);
              return (
                <label
                  key={h}
                  className={cn("flex cursor-pointer items-center gap-2.5 border-b px-2.5 py-1.5 text-xs last:border-b-0", on && "bg-sky-50")}
                >
                  <Checkbox checked={on} onCheckedChange={(v) => toggle(h, Boolean(v))} />
                  <span className="min-w-0 flex-1 truncate font-medium">{h}</span>
                  <span className="max-w-40 shrink-0 truncate text-muted-foreground">
                    {sampleValues(base, h, 3).map(show).join(", ")}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <Field label="Merged column name">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="e.g. Depth interval"
          />
        </Field>
        <Field label="How to combine">
          <SimpleSelect
            ariaLabel="How to combine"
            size="default"
            value={how}
            onChange={(v) => {
              setHow(v as MergeHow);
              setHowTouched(true);
            }}
            options={(Object.keys(MERGE_LABELS) as MergeHow[]).map((k) => ({ value: k, label: MERGE_LABELS[k] }))}
          />
          <p className="text-xs text-muted-foreground">{MERGE_HINTS[how]}</p>
        </Field>
        <div className="rounded-md bg-muted/50 p-2.5 text-xs">
          <div className="mb-1 font-medium">Preview</div>
          {problem ? (
            <span className="text-destructive">{problem}</span>
          ) : preview.length ? (
            <span className="tabular-nums">{preview.map(show).join("  ·  ")}</span>
          ) : (
            <span className="text-muted-foreground">These columns are empty in the first rows.</span>
          )}
        </div>
      </div>
      <DialogFooter className="m-0 rounded-b-xl border-t p-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={Boolean(problem)}>
          <Combine /> {request.index === null ? "Merge" : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

const FORMULA_EXAMPLES = [
  { label: "Fixed text", value: "MultiNet" },
  { label: "Fixed number", value: "0.25" },
  { label: "Difference", value: "=[A] - [B]" },
  { label: "Average", value: "=mean([A], [B])" },
];

function AddForm({
  request,
  base,
  onClose,
  onSave,
}: {
  request: Extract<EditorRequest, { mode: "add" }>;
  base: RawTable;
  onClose: () => void;
  onSave: (edit: ColumnEdit) => void;
}) {
  const [name, setName] = useState(request.name ?? "");
  const [formula, setFormula] = useState(request.formula ?? "");
  const previewName = name.trim() || "New column";
  const result = useMemo(
    () => applyEdits(base, [{ id: "preview", op: "add", name: previewName, formula }]),
    [base, previewName, formula],
  );
  const problem = result.problems.preview;
  const preview = problem ? [] : sampleValues(result.table, previewName, 5);

  const insert = (col: string) => {
    const ref = `[${col}]`;
    setFormula((f) => (f.trim() === "" ? `=${ref}` : f.startsWith("=") ? `${f}${/[\s(=+\-*/,]$/.test(f) ? "" : " "}${ref}` : `=${ref}`));
  };

  const save = () => {
    if (problem || !name.trim()) return;
    onSave({ id: editId(), op: "add", name: name.trim(), formula });
  };

  return (
    <>
      <DialogHeader className="border-b p-4 pr-12">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Plus className="size-4 text-sky-700" /> {request.index === null ? "Add a column" : "Edit column"}
        </DialogTitle>
        <DialogDescription>
          Fill every row with a fixed value (the net type, a mesh size, a project code), or calculate it from other
          columns with a formula that starts with “=”.
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <Field label="Column name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Net type, Layer thickness [m]" autoFocus />
        </Field>
        <Field label="Value or formula">
          <Input
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="MultiNet   or   =[Depth interval From bottom] - [Depth interval From top]"
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-1 pt-1">
            {FORMULA_EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setFormula(ex.value)}
                className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                {ex.label}: <span className="font-mono">{ex.value}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Columns3 className="size-3.5" /> Click a column to use it in the formula
          </Label>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
            {base.headers.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => insert(h)}
                className="rounded-md border bg-background px-2 py-0.5 text-xs hover:border-sky-300 hover:bg-sky-50"
              >
                {h}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Use + − × (*) ÷ (/) ^ and brackets, plus abs, sqrt, ln, log, exp, round, min, max and mean. Empty or text
            cells give an empty result.
          </p>
        </div>
        <div className="rounded-md bg-muted/50 p-2.5 text-xs">
          <div className="mb-1 font-medium">Preview</div>
          {problem && formula.trim() !== "" ? (
            <span className="text-destructive">{problem}</span>
          ) : preview.length ? (
            <span className="tabular-nums">{preview.map(show).join("  ·  ")}</span>
          ) : (
            <span className="text-muted-foreground">Type a value or formula to see the first rows.</span>
          )}
        </div>
      </div>
      <DialogFooter className="m-0 rounded-b-xl border-t p-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={Boolean(problem) || !name.trim()}>
          <Plus /> {request.index === null ? "Add column" : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}
