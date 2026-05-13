import type { ReactNode } from "react";

interface FilterBarProps {
  children?: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
}

export function FilterBar({ children, summary, actions }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/60 p-3.5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        {children}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {summary ? (
          <div className="text-sm text-muted-foreground">{summary}</div>
        ) : null}
        {actions}
      </div>
    </div>
  );
}
