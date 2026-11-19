"use client";

import { useEffect, useRef, useState } from "react";
import type * as PlotlyTypes from "plotly.js";
import { Loader2 } from "lucide-react";

type PlotlyModule = typeof PlotlyTypes;
let plotlyPromise: Promise<PlotlyModule> | null = null;
function loadPlotly() {
  plotlyPromise ??= import("plotly.js-dist-min").then((m) => (m.default ?? m) as unknown as PlotlyModule);
  return plotlyPromise;
}

export interface PlotClick {
  customdata: unknown;
  x: unknown;
  y: unknown;
}

interface Props {
  data: Partial<PlotlyTypes.Data>[];
  layout: Partial<PlotlyTypes.Layout>;
  fileName?: string;
  onPointClick?: (p: PlotClick) => void;
  className?: string;
}

const FONT = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";

export function Plot({ data, layout, fileName = "plot", onPointClick, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [plotly, setPlotly] = useState<PlotlyModule | null>(null);
  const clickRef = useRef(onPointClick);
  useEffect(() => {
    clickRef.current = onPointClick;
  });

  useEffect(() => {
    let alive = true;
    loadPlotly().then((p) => alive && setPlotly(p));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!plotly || !el) return;
    plotly.react(
      el,
      data as PlotlyTypes.Data[],
      {
        autosize: true,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "#ffffff",
        font: { family: FONT, size: 11, color: "#334155" },
        margin: { l: 60, r: 20, t: 30, b: 50 },
        hoverlabel: { font: { family: FONT, size: 11 } },
        ...layout,
      },
      {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
        toImageButtonOptions: { filename: fileName, scale: 3, format: "png" },
      },
    );
  }, [plotly, data, layout, fileName]);

  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { on?: (ev: string, cb: (e: unknown) => void) => void; removeAllListeners?: (ev: string) => void }) | null;
    if (!plotly || !el?.on) return;
    el.removeAllListeners?.("plotly_click");
    el.on("plotly_click", (e) => {
      const pt = (e as { points?: PlotClick[] }).points?.[0];
      if (pt && clickRef.current) clickRef.current(pt);
    });
  }, [plotly, data]);

  useEffect(() => {
    const el = ref.current;
    if (!plotly || !el) return;
    const ro = new ResizeObserver(() => plotly.Plots.resize(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [plotly]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el && plotly) plotly.purge(el);
    };
  }, [plotly]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      {!plotly && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading plot engine…
        </div>
      )}
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}
