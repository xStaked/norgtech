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
  /** Barra dentro del borde de la tabla: conteo, paginacion, nota de ayuda. */
  footer?: ReactNode;
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
  footer,
  rowStyle,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return emptyState;
  }

  return (
    <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
      <table className="w-full min-w-[720px] border-separate border-spacing-0">
        {caption ? (
          <caption className="px-4 pt-3.5 text-left text-sm text-muted-foreground">
            {caption}
          </caption>
        ) : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`whitespace-nowrap border-b border-border bg-muted px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#7a8696] ${toCellAlign(column.align)}`}
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
              className="bg-card transition-colors odd:bg-[#fafbfc] hover:bg-[#eff4fb]"
              style={rowStyle?.(row, index)}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`border-b border-[#eef1f6] px-4 py-3 align-middle text-[12.5px] text-foreground ${toCellAlign(column.align)}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer ? (
        <div className="bg-[#fafbfc] px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
