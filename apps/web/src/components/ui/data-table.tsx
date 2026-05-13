import type { CSSProperties, ReactNode } from "react";

type Align = "left" | "center" | "right";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  width?: string;
  align?: Align;
}

interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T, index: number) => string;
  emptyState?: ReactNode;
  caption?: ReactNode;
  rowStyle?: (row: T, index: number) => CSSProperties | undefined;
}

function toCellAlign(align: Align | undefined): string {
  if (!align) return "text-left";
  return `text-${align}`;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyState,
  caption,
  rowStyle,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return emptyState;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/40 bg-card/60 shadow-sm backdrop-blur-sm">
      <table className="w-full min-w-[720px] border-separate border-spacing-0">
        {caption ? (
          <caption className="px-5 pt-4 text-left text-sm text-muted-foreground">
            {caption}
          </caption>
        ) : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`whitespace-nowrap bg-card/80 px-4 py-3.5 text-left text-xs font-extrabold uppercase tracking-wider text-muted-foreground border-b border-border/40 ${toCellAlign(column.align)}`}
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={getRowKey(row, index)}
              className="transition-colors hover:bg-muted/30"
              style={rowStyle?.(row, index)}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3.5 text-sm text-foreground align-top border-b border-border/20 last:border-b-0 ${toCellAlign(column.align)}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
