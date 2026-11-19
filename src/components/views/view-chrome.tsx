"use client";

import type { ReactNode } from "react";
import { BarChart3, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { measuredIndices } from "@/lib/odv/interpret";
import { useStore } from "@/lib/store";

export function ViewToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 border-b px-3 py-2">{children}</div>;
}

export function EmptyPlot({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="rounded-full bg-muted p-3">
        <BarChart3 className="size-5 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function useHasMeasurements() {
  return useStore((s) => (s.dataset ? measuredIndices(s.dataset).length > 0 : false));
}

/** Shown in plot views when a file (typically a net or sampling log) has nothing measured to plot. */
export function NothingMeasured({ what }: { what: string }) {
  const hasIntervals = useStore((s) => s.dataset?.interval !== undefined);
  const setView = useStore((s) => s.setView);
  return (
    <EmptyPlot
      title={`No measurements to draw ${what}`}
      body={
        hasIntervals
          ? "This file is a sampling log: it records the depth interval, IDs and remarks of each sample, but no measured values yet. Add a column of results (for example abundance or biomass) to plot them here."
          : "Every numeric column in this file is the depth axis. Mark at least one column as a data variable when importing."
      }
      action={
        hasIntervals && (
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setView("intervals")}>
            <Ruler /> Show sampling intervals
          </Button>
        )
      }
    />
  );
}
