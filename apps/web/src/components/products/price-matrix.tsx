"use client";

import { useState } from "react";
import {
  extraLevelCount,
  formatPrice,
  formatTax,
  priceLevels,
  priceListOwner,
  type PriceCell,
  type PriceListRef,
  type Presentation,
} from "@/lib/catalog";

interface PriceMatrixProps {
  presentations: Presentation[];
  priceLists: PriceListRef[];
  totalLists: number;
}

const CURRENCY_BADGE: Record<string, string> = {
  USD: "bg-[#e8f0e6] text-[#3d6b2f]",
  COP: "bg-[#e6f0f6] text-[#0f5c8a]",
};

function currencyBadge(currency: string) {
  return CURRENCY_BADGE[currency] ?? CURRENCY_BADGE.COP;
}

/**
 * Qué es esta columna. Para las de cliente el encabezado ya trae el nombre del
 * cliente, así que el subtítulo solo aclara la naturaleza de la lista: sin
 * esto, un segmento y una línea de producto se leían como si fueran clientes.
 */
function columnSubtitle(list: PriceListRef) {
  if (list.kind === "export") return `país${list.country ? ` · ${list.country}` : ""}`;
  if (list.kind === "linea") return "línea de producto";
  if (list.kind === "segmento") return "segmento";
  return list.customers?.length ? "cliente" : "sin cliente asignado";
}

/**
 * Matriz presentación × lista. La columna de presentación queda fija y las
 * listas hacen scroll horizontal: son hasta 19 columnas.
 */
export function PriceMatrix({ presentations, priceLists, totalLists }: PriceMatrixProps) {
  const [withTax, setWithTax] = useState(false);
  const [openLevels, setOpenLevels] = useState<{ cell: PriceCell; empaque: string } | null>(null);

  const byList = (presentation: Presentation) =>
    new Map(presentation.prices.map((price) => [price.priceListId, price]));

  if (priceLists.length === 0) {
    return (
      <div className="rounded-[11px] border border-border bg-card p-8 text-center text-[13px] text-muted-foreground">
        Este producto no tiene precio en ninguna lista todavía.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[11px] border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f6] px-[18px] py-[13px]">
        <div>
          <div className="text-[14.5px] font-extrabold text-foreground">Precios por lista</div>
          <div className="mt-px text-[11.5px] text-muted-foreground">
            {priceLists.length} de {totalLists} listas · los precios se muestran tal cual los
            envió el cliente
          </div>
        </div>
        <div
          className="inline-flex overflow-hidden rounded-lg border border-input bg-[#f4f6f9]"
          role="group"
          aria-label="Mostrar precios sin o con IVA"
        >
          {([false, true] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={withTax === value}
              onClick={() => setWithTax(value)}
              className={
                withTax === value
                  ? "bg-card px-3.5 py-1.5 text-xs font-bold text-foreground shadow-[inset_0_-2px_0_#0f5c8a]"
                  : "px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              }
            >
              {value ? "Con IVA" : "Sin IVA"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        <div className="relative z-[2] w-[190px] shrink-0 border-r border-[#e3e6eb] bg-[#fafbfc] shadow-[4px_0_8px_rgba(12,44,68,.04)]">
          <div className="flex h-[52px] items-end border-b border-[#e3e6eb] px-4 pb-2 text-[10.5px] font-bold tracking-[.05em] text-[#7a8696] uppercase">
            Presentación
          </div>
          {presentations.map((presentation) => (
            <div
              key={presentation.id}
              className="flex h-[52px] flex-col justify-center border-b border-[#eef1f6] px-4"
            >
              <div className="truncate text-[12.5px] font-bold text-foreground">
                {presentation.empaque}
              </div>
              <div className="truncate text-[10.5px] text-muted-foreground">
                {presentation.form ?? ""}
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ minWidth: priceLists.length * 154 }}>
            <div
              className="grid border-b border-[#e3e6eb]"
              style={{ gridTemplateColumns: `repeat(${priceLists.length}, minmax(154px, 1fr))` }}
            >
              {priceLists.map((list) => (
                <div
                  key={list.id}
                  className="flex h-[52px] flex-col justify-end border-r border-[#f0f2f6] px-3.5 pb-2"
                >
                  <div
                    className="truncate text-[11.5px] font-extrabold tracking-[.02em] text-foreground"
                    title={priceListOwner(list)}
                  >
                    {priceListOwner(list)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-[5px]">
                    <span
                      className={`rounded px-1.5 py-px text-[9.5px] font-bold ${currencyBadge(list.currency)}`}
                    >
                      {list.currency}
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {columnSubtitle(list)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {presentations.map((presentation) => {
              const prices = byList(presentation);
              return (
                <div
                  key={presentation.id}
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${priceLists.length}, minmax(154px, 1fr))`,
                  }}
                >
                  {priceLists.map((list) => {
                    const cell = prices.get(list.id);
                    if (!cell) {
                      return (
                        <div
                          key={list.id}
                          title="No está en esta lista"
                          className="flex h-[52px] items-center justify-end border-r border-[#f0f2f6] border-b border-b-[#eef1f6] bg-[#fbfcfd] px-3.5 text-xs text-[#c2cbd6]"
                        >
                          —
                        </div>
                      );
                    }

                    const extra = extraLevelCount(cell);
                    const value = withTax ? cell.priceConIva : cell.priceSinIva;

                    return (
                      <div
                        key={list.id}
                        className="flex h-[52px] items-center justify-end border-r border-[#f0f2f6] border-b border-b-[#eef1f6] px-3.5 hover:bg-[#eff4fb]"
                      >
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-[5px]">
                            {extra > 0 ? (
                              <button
                                type="button"
                                title="Niveles adicionales"
                                onClick={() =>
                                  setOpenLevels({ cell, empaque: presentation.empaque })
                                }
                                className="cursor-pointer rounded bg-[#e6f0f6] px-[5px] py-px text-[9px] font-extrabold text-[#0f5c8a] hover:bg-[#d6e6f0]"
                              >
                                +{extra}
                              </button>
                            ) : null}
                            <span
                              className={`font-mono text-[12.5px] font-semibold tabular-nums ${
                                cell.currency === "USD" ? "text-[#3d6b2f]" : "text-foreground"
                              }`}
                            >
                              {formatPrice(value, cell.currency) || "—"}
                            </span>
                          </div>
                          <div className="mt-px text-[9.5px] text-muted-foreground">
                            IVA {formatTax(cell.taxPercent)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef1f6] bg-[#fafbfc] px-[18px] py-2.5">
        <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-[#c2cbd6]">—</span>No está en esta lista (no es un
            error)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-[#e6f0f6] px-[5px] py-px text-[9px] font-extrabold text-[#0f5c8a]">
              +2
            </span>
            Niveles adicionales de precio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-[#e8f0e6] px-1.5 py-px text-[9.5px] font-bold text-[#3d6b2f]">
              USD
            </span>
            Sin conversión — nunca se mezclan monedas
          </span>
        </div>
      </div>

      {openLevels ? (
        <LevelsDialog
          cell={openLevels.cell}
          empaque={openLevels.empaque}
          onClose={() => setOpenLevels(null)}
        />
      ) : null}
    </div>
  );
}

function LevelsDialog({
  cell,
  empaque,
  onClose,
}: {
  cell: PriceCell;
  empaque: string;
  onClose: () => void;
}) {
  const levels = priceLevels(cell);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Niveles de precio de ${cell.priceListName}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] rounded-xl border border-[#dfe2e8] bg-card px-[18px] py-4 shadow-[0_16px_40px_rgba(12,44,68,.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="text-[13px] font-extrabold text-foreground">
            {cell.priceListName} · {empaque}
          </div>
          <span
            className={`rounded px-1.5 py-px text-[9.5px] font-bold ${currencyBadge(cell.currency)}`}
          >
            {cell.currency}
          </span>
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Niveles sin nombre comercial confirmado — se muestran como los envió el cliente.
        </p>

        <div className="grid grid-cols-[80px_1fr_1fr] gap-x-3 border-b border-[#eef1f6] py-1.5 text-[10.5px] font-bold tracking-[.05em] text-[#7a8696] uppercase">
          <div>Nivel</div>
          <div className="text-right">Sin IVA</div>
          <div className="text-right">Con IVA</div>
        </div>
        {levels.map((level, index) => (
          <div
            key={level.label}
            className="grid grid-cols-[80px_1fr_1fr] items-center gap-x-3 border-b border-[#f4f6f9] py-2.5 text-[12.5px]"
          >
            <div>
              <span
                className={`rounded-[5px] px-2 py-0.5 text-[11px] font-bold ${
                  index === 0 ? "bg-[#e6f0f6] text-[#0f5c8a]" : "bg-[#eef1f6] text-[#5b6b80]"
                }`}
              >
                {level.label}
              </span>
            </div>
            <div className="text-right font-mono font-semibold tabular-nums text-foreground">
              {formatPrice(level.sinIva, cell.currency) || "—"}
            </div>
            <div className="text-right font-mono tabular-nums text-muted-foreground">
              {formatPrice(level.conIva, cell.currency) || "—"}
            </div>
          </div>
        ))}
        <p className="mt-2.5 text-[10.5px] text-muted-foreground">
          IVA {formatTax(cell.taxPercent)} · el precio con IVA viene del backend, no se calcula.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-9 w-full rounded-lg border border-input bg-card text-[13px] font-bold text-foreground hover:bg-muted"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
