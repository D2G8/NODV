"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CloudUpload,
  Copy,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Library,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deleteDataset,
  downloadDataset,
  LibraryNotSetUpError,
  listDatasets,
  saveDataset,
  SUPABASE_SQL_EDITOR_URL,
  type SavedDataset,
} from "@/lib/library";
import { formatDate } from "@/lib/odv/dates";
import { useStore } from "@/lib/store";
import { useImporter } from "@/lib/use-importer";
import { cn } from "@/lib/utils";

type LibraryState =
  | { status: "loading" }
  | { status: "ready"; items: SavedDataset[] }
  | { status: "not-set-up" }
  | { status: "error"; message: string };

function useLibrary(enabled = true) {
  const version = useStore((s) => s.libraryVersion);
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    listDatasets()
      .then((items) => alive && setState({ status: "ready", items }))
      .catch((err) => {
        if (!alive) return;
        if (err instanceof LibraryNotSetUpError) setState({ status: "not-set-up" });
        else setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, [enabled, version, nonce]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setNonce((n) => n + 1);
  }, []);
  return { state, reload };
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function useOpenSaved() {
  const { openFile } = useImporter();
  const setLoading = useStore((s) => s.setLoading);
  return useCallback(
    async (row: SavedDataset) => {
      setLoading(`Downloading ${row.file_name}…`);
      try {
        const file = await downloadDataset(row);
        await openFile(file, { saved: { id: row.id, settings: row.import_settings } });
      } catch (err) {
        setLoading(null);
        toast.error("Couldn’t open the saved dataset", { description: err instanceof Error ? err.message : String(err) });
      }
    },
    [openFile, setLoading],
  );
}

export function SaveToLibraryButton() {
  const dataset = useStore((s) => s.dataset);
  const source = useStore((s) => s.source);
  const markSaved = useStore((s) => s.markSaved);
  const setLibraryOpen = useStore((s) => s.setLibraryOpen);
  const [saving, setSaving] = useState(false);
  if (!dataset) return null;

  if (source?.savedId) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setLibraryOpen(true)} title="Saved in your library">
        <Check className="text-emerald-600" /> <span className="hidden md:inline">Saved</span>
      </Button>
    );
  }

  const save = async () => {
    if (!source) {
      toast.error("This dataset can’t be saved", { description: "Open the original file again, then save it." });
      return;
    }
    setSaving(true);
    try {
      const row = await saveDataset(source.file, dataset, source.settings);
      markSaved(row.id);
      toast.success(`Saved “${row.name}” to your library`);
    } catch (err) {
      if (err instanceof LibraryNotSetUpError) {
        setLibraryOpen(true);
        toast.error("Finish setting up the library first");
      } else {
        toast.error("Couldn’t save to the library", { description: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={save} disabled={saving} title="Save this file and its import settings to your Supabase library">
      {saving ? <Loader2 className="animate-spin" /> : <CloudUpload />} <span className="hidden md:inline">Save</span>
    </Button>
  );
}

export function LibraryButton() {
  const setLibraryOpen = useStore((s) => s.setLibraryOpen);
  return (
    <Button size="sm" variant="ghost" onClick={() => setLibraryOpen(true)}>
      <Library /> <span className="hidden sm:inline">Library</span>
    </Button>
  );
}

export function LibraryDialog() {
  const open = useStore((s) => s.libraryOpen);
  const setOpen = useStore((s) => s.setLibraryOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Database className="size-4 text-sky-700" /> Dataset library
          </DialogTitle>
          <DialogDescription>
            Files saved here are stored in your Supabase project with their column settings, so they reopen in one click.
          </DialogDescription>
        </DialogHeader>
        {open && <LibraryList />}
      </DialogContent>
    </Dialog>
  );
}

function LibraryList({ limit, compact }: { limit?: number; compact?: boolean }) {
  const { state, reload } = useLibrary();
  const openSaved = useOpenSaved();
  const bumpLibrary = useStore((s) => s.bumpLibrary);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const remove = async (row: SavedDataset) => {
    setDeleting(row.id);
    try {
      await deleteDataset(row);
      toast.success(`Removed “${row.name}”`);
      bumpLibrary();
    } catch (err) {
      toast.error("Couldn’t remove the dataset", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  };

  if (state.status === "loading")
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading library…
      </div>
    );
  if (state.status === "not-set-up") return <SetupNotice onDone={reload} compact={compact} />;
  if (state.status === "error")
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center text-sm">
        <AlertCircle className="size-5 text-destructive" />
        <div>
          <div className="font-medium">Couldn’t reach the library</div>
          <div className="text-xs text-muted-foreground">{state.message}</div>
        </div>
        <Button size="sm" variant="outline" onClick={reload}>
          <RefreshCw /> Try again
        </Button>
      </div>
    );

  const items = limit ? state.items.slice(0, limit) : state.items;
  if (items.length === 0)
    return (
      <div className={cn("flex flex-col items-center gap-2 text-center", compact ? "rounded-xl border border-dashed bg-card p-6" : "p-10")}>
        <Library className="size-5 text-muted-foreground" />
        <div className="text-sm font-medium">No saved datasets yet</div>
        <p className="max-w-sm text-xs text-muted-foreground">
          Open a file, then press <span className="font-medium text-foreground">Save</span> in the top bar to keep it here.
        </p>
      </div>
    );

  return (
    <ul className={cn("min-h-0 overflow-auto", compact ? "grid gap-2 sm:grid-cols-2" : "divide-y")}>
      {items.map((row) => (
        <li
          key={row.id}
          className={cn("flex items-center gap-3", compact ? "rounded-xl border bg-card p-3" : "px-4 py-3 hover:bg-muted/30")}
        >
          <div className="rounded-lg bg-muted p-2">
            {row.format === "excel" ? (
              <FileSpreadsheet className="size-4 text-emerald-700" />
            ) : (
              <FileText className="size-4 text-sky-700" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" title={row.file_name}>
              {row.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {row.station_count} stations · {row.sample_count.toLocaleString()} samples
              {row.first_date && ` · ${formatDate(Date.parse(row.first_date), false)} → ${formatDate(Date.parse(row.last_date ?? row.first_date), false)}`}
              {!compact && ` · ${formatBytes(row.size_bytes)} · saved ${formatDate(Date.parse(row.created_at))}`}
            </div>
          </div>
          {confirming === row.id ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="destructive" onClick={() => remove(row)} disabled={deleting === row.id}>
                {deleting === row.id ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                Keep
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={() => openSaved(row)}>
                Open
              </Button>
              {!compact && (
                <Button size="icon-sm" variant="ghost" aria-label={`Remove ${row.name}`} onClick={() => setConfirming(row.id)}>
                  <Trash2 />
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function SetupNotice({ onDone, compact }: { onDone: () => void; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      const sql = await (await fetch("/supabase-setup.sql")).text();
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy automatically", { description: "Open /supabase-setup.sql and copy it by hand." });
    }
  };
  return (
    <div className={cn("flex flex-col gap-3 text-sm", compact ? "rounded-xl border border-amber-200 bg-amber-50/60 p-4" : "p-5")}>
      <div className="flex items-start gap-2">
        <Database className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <div>
          <div className="font-medium">Connect the Supabase library (one-time setup)</div>
          <p className="text-xs text-muted-foreground">
            Your Supabase project is reachable, but its library table and storage bucket don’t exist yet.
          </p>
        </div>
      </div>
      <ol className="ml-6 list-decimal space-y-1 text-xs text-muted-foreground">
        <li>Copy the setup SQL.</li>
        <li>Open the Supabase SQL editor for your project, paste it, and press Run.</li>
        <li>Come back here and press “Check again”.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy setup SQL"}
        </Button>
        <Button size="sm" variant="outline" nativeButton={false} render={<a href={SUPABASE_SQL_EDITOR_URL} target="_blank" rel="noreferrer" />}>
          <ExternalLink /> Open SQL editor
        </Button>
        <Button size="sm" onClick={onDone}>
          <RefreshCw /> Check again
        </Button>
      </div>
    </div>
  );
}

export function RecentLibrary() {
  const setLibraryOpen = useStore((s) => s.setLibraryOpen);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Your saved datasets</h2>
        <Button size="xs" variant="ghost" onClick={() => setLibraryOpen(true)}>
          View all
        </Button>
      </div>
      <LibraryList limit={4} compact />
    </div>
  );
}
