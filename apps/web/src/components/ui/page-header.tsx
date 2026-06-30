import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-[820px]">
        {eyebrow ? (
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/80">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}
