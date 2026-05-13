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
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="m-0 text-3xl font-extrabold tracking-tight text-foreground md:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-[15px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}
