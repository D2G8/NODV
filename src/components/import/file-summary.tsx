"use client";

import { useState } from "react";
import { AlertTriangle, Info, ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FileSummary } from "@/lib/odv/types";
import { cn } from "@/lib/utils";

const COLLAPSED_CHECKS = 5;

export function FileSummaryPanel({ summary, compact = false }: { summary: FileSummary; compact?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const warnings = summary.checks.filter((c) => c.level === "warning").length;
  const shown = showAll ? summary.checks : summary.checks.slice(0, COLLAPSED_CHECKS);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <ScanSearch className="size-4 text-sky-700" />
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">What’s in this file</span>
          <Badge variant="secondary" className="bg-sky-100 text-sky-900">
            {summary.kind}
          </Badge>
        </div>
        <p className={cn("mt-1.5 leading-relaxed text-pretty", compact ? "text-xs" : "text-sm")}>{summary.headline}</p>
      </div>

      {summary.facts.length > 0 && (
        <dl className={cn("grid gap-x-6 gap-y-1.5 text-xs", compact ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3")}>
          {summary.facts.map((f) => (
            <div key={f.label} className="flex min-w-0 gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 font-medium break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {summary.checks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {warnings > 0 ? `${warnings} to check · ` : ""}
            {summary.checks.length - warnings} note{summary.checks.length - warnings === 1 ? "" : "s"} from the log
          </div>
          <ul className="flex flex-col gap-1">
            {shown.map((c, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-md px-2 py-1 text-xs",
                  c.level === "warning" ? "bg-amber-50 text-amber-950" : "bg-muted/60 text-foreground",
                )}
              >
                {c.level === "warning" ? (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                ) : (
                  <Info className="mt-0.5 size-3.5 shrink-0 text-sky-600" />
                )}
                <span className="min-w-0 break-words">{c.text}</span>
              </li>
            ))}
          </ul>
          {summary.checks.length > COLLAPSED_CHECKS && (
            <Button size="xs" variant="ghost" className="self-start" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${summary.checks.length}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
