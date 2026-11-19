"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLOR_SCALES, cssGradient, type ColorScaleId } from "@/lib/odv/colormaps";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: ReactNode;
}

export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  size = "sm",
  ariaLabel,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  ariaLabel?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(String(v))}
      items={options.map((o) => ({ value: o.value, label: o.label }))}
    >
      <SelectTrigger size={size} className={cn("w-full min-w-0", className)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-80">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const NONE = "__none__";

export function VariableSelect({
  label,
  value,
  onChange,
  allowNone,
  noneLabel = "None",
  className,
}: {
  label?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
}) {
  const dataset = useStore((s) => s.dataset);
  const options: Option[] = [
    ...(allowNone ? [{ value: NONE, label: noneLabel }] : []),
    ...(dataset?.variables.filter((v) => !v.sampling).map((v) => ({ value: v.key, label: v.label })) ?? []),
  ];
  return (
    <Field label={label} className={className}>
      <SimpleSelect
        ariaLabel={label}
        value={value ?? (allowNone ? NONE : null)}
        onChange={(v) => onChange(v === NONE ? null : v)}
        options={options}
      />
    </Field>
  );
}

export function Field({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {label && <Label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</Label>}
      {children}
    </div>
  );
}

export function ColorScaleSelect({ className }: { className?: string }) {
  const colorScale = useStore((s) => s.colorScale);
  const setColorScale = useStore((s) => s.setColorScale);
  return (
    <Field label="Palette" className={className}>
      <SimpleSelect
        ariaLabel="Colour palette"
        value={colorScale}
        onChange={(v) => setColorScale(v as ColorScaleId)}
        options={Object.entries(COLOR_SCALES).map(([id, c]) => ({
          value: id,
          label: (
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-10 shrink-0 rounded-sm" style={{ background: cssGradient(c.scale) }} />
              {c.label}
            </span>
          ),
        }))}
      />
    </Field>
  );
}
