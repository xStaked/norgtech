import type { ReactNode } from "react";
import { TONE_BAR, TONE_CHIP, TONE_TEXT, type Tone } from "@/lib/analytics";

/**
 * Piezas visuales compartidas por las 4 pantallas de analitica. Existen para
 * que un mismo dato (una barra de participacion, un semaforo, una tabla) se vea
 * igual en las cuatro; no son un design system nuevo.
 */

/** Tarjeta de KPI. La primera de cada pantalla lleva la franja de marca. */
export function Kpi({
  label,
  value,
  meta,
  tone = "neutral",
  brand = false,
  dot = false,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  tone?: Tone;
  brand?: boolean;
  dot?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-[10px] border border-border bg-card px-[15px] py-3.5">
      {brand ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background:
              "linear-gradient(90deg,#00a651,#a7ce39,#0288c4,#ffcb06,#f58221,#ee1c25)",
          }}
        />
      ) : null}
      <div className="flex items-center gap-[7px] text-[12px] font-semibold text-muted-foreground">
        {dot ? (
          <span
            aria-hidden="true"
            className={`h-[7px] w-[7px] rounded-full ${TONE_BAR[tone]}`}
          />
        ) : null}
        {label}
      </div>
      <div
        className={`mt-1.5 text-[23px] font-extrabold leading-none tracking-[-0.02em] tabular-nums ${
          tone === "neutral" ? "text-foreground" : TONE_TEXT[tone]
        }`}
      >
        {value}
      </div>
      {meta ? <div className="mt-1.5 text-[11px] text-muted-foreground">{meta}</div> : null}
    </div>
  );
}

/** Barra horizontal con su cifra al lado. Participacion, cumplimiento, ratios. */
export function MeterCell({
  percentValue,
  label,
  tone = "neutral",
  width = 100,
}: {
  percentValue: number;
  label: ReactNode;
  tone?: Tone;
  /** Escala de la barra: `percentValue` relativo a este maximo. */
  width?: number;
}) {
  const filled = Math.max(0, Math.min(100, (percentValue / (width || 100)) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${filled}%` }} />
      </div>
      <span className={`w-11 text-right text-[11.5px] font-bold tabular-nums ${TONE_TEXT[tone]}`}>
        {label}
      </span>
    </div>
  );
}

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] font-bold tabular-nums ${TONE_CHIP[tone]}`}
    >
      {children}
    </span>
  );
}

/** Tabla con encabezado en mayusculas y filas cebra, como en el diseño. */
export function DataGrid({
  columns,
  children,
  header,
  footer,
}: {
  /** `grid-template-columns` literal: cada pantalla tiene su propio ancho. */
  columns: string;
  children: ReactNode;
  header: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[11px] border border-border bg-card">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div
            className="grid gap-x-3 bg-muted/60 px-[18px] py-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            style={{ gridTemplateColumns: columns }}
          >
            {header}
          </div>
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}

export function GridRow({
  columns,
  zebra = false,
  children,
  height = 46,
}: {
  columns: string;
  zebra?: boolean;
  children: ReactNode;
  height?: number;
}) {
  return (
    <div
      className={`grid items-center gap-x-3 border-t border-border/60 px-[18px] text-[12.5px] transition-colors hover:bg-accent/5 ${
        zebra ? "bg-muted/30" : ""
      }`}
      style={{ gridTemplateColumns: columns, minHeight: height }}
    >
      {children}
    </div>
  );
}

/** Cabecera de una tarjeta-tabla (titulo + nota a la derecha). */
export function CardHeading({
  title,
  description,
  aside,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/70 px-[18px] py-3">
      <div className="min-w-0">
        <div className="text-[14.5px] font-extrabold">{title}</div>
        {description ? (
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {aside ? <div className="shrink-0 text-[11.5px] text-muted-foreground">{aside}</div> : null}
    </div>
  );
}

/**
 * Estado vacio. Cada breakdown lo necesita por separado: "no hubo ventas con
 * estos filtros" no es lo mismo que "el modulo esta roto".
 */
export function NoData({ children }: { children?: ReactNode }) {
  return (
    <div className="px-[18px] py-8 text-center text-[12.5px] text-muted-foreground">
      {children ?? "Sin datos en este período con los filtros aplicados."}
    </div>
  );
}

/** Aviso ambar: hallazgos y advertencias del contrato (texto libre, etc.). */
export function Notice({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[#f5dfb8] bg-[#fdf0dc] px-4 py-3">
      {icon ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#f58221] text-white">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-foreground">{title}</div>
        {description ? (
          <div className="mt-0.5 text-[12px] text-[#8a6520]">{description}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** Botón de descarga del CSV: mismo endpoint, `format=csv`. */
export function ExportCsvLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-3.5 text-[13px] font-bold text-secondary-foreground transition-colors hover:bg-muted"
    >
      Exportar CSV
    </a>
  );
}
