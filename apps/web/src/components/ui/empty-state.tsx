import type { ReactNode } from "react";

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="grid justify-items-start gap-2.5 rounded-xl border border-dashed border-border/60 bg-muted/30 p-7">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-xl font-extrabold text-primary">
        0
      </div>
      <div className="text-lg font-bold text-foreground">{title}</div>
      {description ? (
        <div className="max-w-[540px] text-sm text-muted-foreground">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
