import type { CSSProperties, ReactNode } from "react";

interface SectionCardProps {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padding?: string | number;
  className?: string;
  style?: CSSProperties;
}

export function SectionCard({
  children,
  title,
  description,
  actions,
  padding = "20px",
  className,
  style,
}: SectionCardProps) {
  return (
    <section
      className={`rounded-[11px] border border-border bg-card ${className ?? ""}`}
      style={{ padding, ...style }}
    >
      {title || description || actions ? (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="m-0 text-lg font-bold leading-tight text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <div className="mt-1.5 text-sm text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
