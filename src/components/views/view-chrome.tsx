import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";

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
