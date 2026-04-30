import type { CSSProperties, ReactNode } from "react";
import { crmTheme } from "@/components/ui/theme";

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

function toCellAlign(align: Align | undefined): CSSProperties["textAlign"] {
  if (!align) return "left";
  return align;
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
    <div
      style={{
        overflowX: "auto",
        background: crmTheme.colors.surface,
        border: `1px solid ${crmTheme.colors.border}`,
        borderRadius: crmTheme.radius.lg,
        boxShadow: crmTheme.shadow.card,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          minWidth: 720,
        }}
      >
        {caption ? (
          <caption
            style={{
              padding: "16px 20px 0",
              textAlign: "left",
              fontSize: 13,
              color: crmTheme.colors.textMuted,
            }}
          >
            {caption}
          </caption>
        ) : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  width: column.width,
                  padding: "14px 18px",
                  borderBottom: `1px solid ${crmTheme.colors.border}`,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textAlign: toCellAlign(column.align),
                  color: crmTheme.colors.textSubtle,
                  background: crmTheme.colors.surface,
                  whiteSpace: "nowrap",
                }}
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
              style={{
                background: index % 2 === 0 ? "transparent" : "rgba(238, 243, 248, 0.56)",
                ...rowStyle?.(row, index),
              }}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={{
                    padding: "15px 18px",
                    borderBottom:
                      index === rows.length - 1 ? "none" : `1px solid ${crmTheme.colors.border}`,
                    textAlign: toCellAlign(column.align),
                    verticalAlign: "top",
                    fontSize: 14,
                    color: crmTheme.colors.text,
                  }}
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
