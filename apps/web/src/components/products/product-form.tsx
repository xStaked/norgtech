"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PRICE_LIST_KIND_LABEL,
  priceListContext,
  priceListOwner,
  type PriceListRef,
  type ProductDetail,
} from "@/lib/catalog";

interface ProductFormProps {
  priceLists: PriceListRef[];
  product?: ProductDetail;
}

interface PresentationRow {
  key: string;
  id?: string;
  empaque: string;
  form: string;
  dosage: string;
  active: boolean;
}

interface PriceRow {
  key: string;
  presentationKey: string;
  priceListId: string;
  sinIva: string;
  conIva: string;
  taxPercent: string;
}

const inputClasses =
  "h-[38px] w-full rounded-lg border border-input bg-card px-3 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const numberClasses = `${inputClasses} text-right font-mono tabular-nums`;

let seq = 0;
const nextKey = () => `row-${(seq += 1)}`;

function toRows(product?: ProductDetail): {
  presentations: PresentationRow[];
  prices: PriceRow[];
} {
  if (!product) {
    return {
      presentations: [{ key: nextKey(), empaque: "", form: "", dosage: "", active: true }],
      prices: [],
    };
  }

  const presentations: PresentationRow[] = product.presentations.map((p) => ({
    key: nextKey(),
    id: p.id,
    empaque: p.empaque,
    form: p.form ?? "",
    dosage: p.dosage ?? "",
    active: p.active,
  }));

  const prices: PriceRow[] = product.presentations.flatMap((p, index) =>
    p.prices.map((price) => ({
      key: nextKey(),
      presentationKey: presentations[index].key,
      priceListId: price.priceListId,
      sinIva: price.priceSinIva ?? "",
      conIva: price.priceConIva ?? "",
      taxPercent: price.taxPercent ?? "",
    })),
  );

  return { presentations, prices };
}

/** "" -> undefined; el backend distingue "sin dato" de 0. */
const optionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
};

export function ProductForm({ priceLists, product }: ProductFormProps) {
  const router = useRouter();
  const initial = useMemo(() => toRows(product), [product]);

  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [presentations, setPresentations] = useState<PresentationRow[]>(initial.presentations);
  const [prices, setPrices] = useState<PriceRow[]>(initial.prices);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(product);
  const livePresentations = presentations.filter((p) => p.active);
  const currencies = useMemo(() => {
    const used = new Set(
      prices
        .map((row) => priceLists.find((list) => list.id === row.priceListId)?.currency)
        .filter(Boolean) as string[],
    );
    return [...used].sort();
  }, [prices, priceLists]);

  function updatePresentation(key: string, patch: Partial<PresentationRow>) {
    setPresentations((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removePresentation(key: string) {
    const row = presentations.find((p) => p.key === key);
    // Si ya existe en la base se desactiva, no se borra: los precios cuelgan
    // de ella con onDelete: Cascade y se irían con la presentación.
    if (row?.id) {
      updatePresentation(key, { active: false });
      return;
    }
    setPresentations((rows) => rows.filter((p) => p.key !== key));
    setPrices((rows) => rows.filter((p) => p.presentationKey !== key));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const withEmpaque = presentations.filter((p) => p.empaque.trim() && p.active);
    if (withEmpaque.length === 0) {
      setError("Se necesita al menos una presentación con empaque.");
      return;
    }

    setSaving(true);
    try {
      const presentationIdByKey = new Map<string, string>();
      let productId = product?.id ?? "";

      if (isEdit) {
        const response = await apiFetchClient(`/products/${productId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            unit: unit.trim(),
            description: description.trim() || undefined,
            active,
          }),
        });
        if (!response.ok) throw new Error(await messageOf(response, "guardar el producto"));

        for (const row of presentations) {
          const body = {
            empaque: row.empaque.trim(),
            form: row.form.trim() || undefined,
            dosage: row.dosage.trim() || undefined,
            active: row.active,
          };
          if (row.id) {
            const patch = await apiFetchClient(`/product-presentations/${row.id}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            });
            if (!patch.ok) throw new Error(await messageOf(patch, `guardar ${row.empaque}`));
            presentationIdByKey.set(row.key, row.id);
          } else if (row.empaque.trim()) {
            const created = await apiFetchClient(`/products/${productId}/presentations`, {
              method: "POST",
              body: JSON.stringify(body),
            });
            if (!created.ok) throw new Error(await messageOf(created, `crear ${row.empaque}`));
            presentationIdByKey.set(row.key, (await created.json()).id);
          }
        }
      } else {
        const response = await apiFetchClient("/products", {
          method: "POST",
          body: JSON.stringify({
            sku: sku.trim(),
            name: name.trim(),
            unit: unit.trim(),
            description: description.trim() || undefined,
            active,
            presentations: withEmpaque.map((row) => ({
              empaque: row.empaque.trim(),
              form: row.form.trim() || undefined,
              dosage: row.dosage.trim() || undefined,
            })),
          }),
        });
        if (!response.ok) throw new Error(await messageOf(response, "crear el producto"));

        const created = await response.json();
        productId = created.id;
        for (const row of withEmpaque) {
          const match = created.presentations?.find(
            (p: { id: string; empaque: string }) => p.empaque === row.empaque.trim(),
          );
          if (match) presentationIdByKey.set(row.key, match.id);
        }
      }

      for (const row of prices) {
        const presentationId = presentationIdByKey.get(row.presentationKey);
        if (!presentationId || !row.priceListId) continue;
        const response = await apiFetchClient(`/price-lists/${row.priceListId}/items`, {
          method: "PUT",
          body: JSON.stringify({
            presentationId,
            priceSinIva: optionalNumber(row.sinIva),
            priceConIva: optionalNumber(row.conIva),
            taxPercent: optionalNumber(row.taxPercent),
          }),
        });
        if (!response.ok) throw new Error(await messageOf(response, "guardar un precio"));
      }

      router.push(`/products/${productId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de conexión");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:items-start">
      <div className="flex flex-col gap-4">
        {error ? (
          <p className="rounded-lg bg-[#fcebe9] px-4 py-2.5 text-sm text-destructive">{error}</p>
        ) : null}

        <section className="rounded-[11px] border border-border bg-card px-[18px] py-4">
          <h2 className="mb-3.5 text-[14.5px] font-extrabold text-foreground">
            Información general
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-[11.5px] text-muted-foreground">
                SKU <span className="text-destructive">*</span>
              </Label>
              <input
                className={`${inputClasses} font-mono ${isEdit ? "bg-[#f7f8fa] text-[#7a8696]" : ""}`}
                value={sku}
                readOnly={isEdit}
                required
                onChange={(event) => setSku(event.target.value)}
              />
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                Único. No se cambia al editar.
              </p>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11.5px] text-muted-foreground">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <input
                className={`${inputClasses} font-semibold`}
                value={name}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11.5px] text-muted-foreground">
                Unidad / forma <span className="text-destructive">*</span>
              </Label>
              <input
                className={inputClasses}
                value={unit}
                required
                placeholder="Polvo soluble"
                onChange={(event) => setUnit(event.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11.5px] text-muted-foreground">Estado</Label>
              <label className="flex h-[38px] cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#00a651]"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                />
                <span
                  className={`text-[13px] font-semibold ${active ? "text-[#167c4a]" : "text-muted-foreground"}`}
                >
                  {active ? "Activo" : "Inactivo"}
                </span>
              </label>
            </div>
          </div>
          <div className="mt-3.5">
            <Label className="mb-1.5 block text-[11.5px] text-muted-foreground">Descripción</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </section>

        <section className="rounded-[11px] border border-border bg-card px-[18px] py-4">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-[14.5px] font-extrabold text-foreground">
              Presentaciones <span className="text-destructive">*</span>
            </h2>
            <span className="text-[11.5px] text-muted-foreground">Mínimo una</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            El empaque se guarda tal cual se escribe — no se normaliza el formato.
          </p>

          <div className="mb-1.5 hidden grid-cols-[1.2fr_1fr_1.2fr_80px] gap-x-2.5 text-[10.5px] font-bold tracking-[.05em] text-[#7a8696] uppercase sm:grid">
            <div>
              Empaque <span className="text-destructive">*</span>
            </div>
            <div>Forma</div>
            <div>Dosificación</div>
            <div />
          </div>

          {presentations.map((row) => (
            <div
              key={row.key}
              className={`mb-2.5 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1.2fr_1fr_1.2fr_80px] sm:gap-x-2.5 ${
                row.active ? "" : "opacity-50"
              }`}
            >
              <input
                className={inputClasses}
                placeholder="Bolsa x 500 g"
                aria-label="Empaque"
                value={row.empaque}
                onChange={(event) => updatePresentation(row.key, { empaque: event.target.value })}
              />
              <input
                className={inputClasses}
                placeholder="Polvo soluble"
                aria-label="Forma"
                value={row.form}
                onChange={(event) => updatePresentation(row.key, { form: event.target.value })}
              />
              <input
                className={inputClasses}
                placeholder="Opcional"
                aria-label="Dosificación"
                value={row.dosage}
                onChange={(event) => updatePresentation(row.key, { dosage: event.target.value })}
              />
              <button
                type="button"
                onClick={() =>
                  row.active
                    ? removePresentation(row.key)
                    : updatePresentation(row.key, { active: true })
                }
                className="h-[38px] rounded-lg border border-input bg-card text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                {row.active ? (row.id ? "Desactivar" : "Quitar") : "Activar"}
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setPresentations((rows) => [
                ...rows,
                { key: nextKey(), empaque: "", form: "", dosage: "", active: true },
              ])
            }
            className="mt-1 flex h-[34px] items-center gap-1.5 rounded-lg border border-dashed border-[#c2cbd6] bg-card px-3 text-[12.5px] font-bold text-[#0f5c8a] hover:bg-muted"
          >
            + Agregar presentación
          </button>
        </section>

        <section className="rounded-[11px] border border-border bg-card px-[18px] py-4">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-[14.5px] font-extrabold text-foreground">Precios por lista</h2>
            <span className="rounded-md bg-[#eef1f5] px-2.5 py-0.5 text-[11px] font-bold text-[#7a8696]">
              Opcional
            </span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Cada precio pertenece a una (presentación, lista). Con IVA no se calcula: se captura
            como lo envió el cliente.
          </p>

          {livePresentations.map((presentation) => {
            const rows = prices.filter((row) => row.presentationKey === presentation.key);
            return (
              <div
                key={presentation.key}
                className="mb-2.5 rounded-[9px] border border-[#eef1f6] bg-[#fafbfc] px-3.5 py-3"
              >
                <div className="mb-2.5 text-xs font-bold text-foreground">
                  {presentation.empaque || "Presentación sin empaque"}
                </div>

                {rows.length > 0 ? (
                  <div className="mb-1.5 hidden grid-cols-[1.3fr_110px_110px_76px_70px] gap-x-2.5 text-[10px] font-bold tracking-[.05em] text-[#7a8696] uppercase sm:grid">
                    <div>Lista</div>
                    <div className="text-right">Sin IVA</div>
                    <div className="text-right">Con IVA</div>
                    <div className="text-right">IVA %</div>
                    <div />
                  </div>
                ) : null}

                {rows.map((row) => {
                  const list = priceLists.find((item) => item.id === row.priceListId);
                  return (
                    <div
                      key={row.key}
                      className="mb-2 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1.3fr_110px_110px_76px_70px] sm:gap-x-2.5"
                    >
                      <div>
                        <select
                          className={inputClasses}
                          aria-label="Para quién es este precio"
                          value={row.priceListId}
                          onChange={(event) =>
                            setPrices((all) =>
                              all.map((item) =>
                                item.key === row.key
                                  ? { ...item, priceListId: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="">¿Para quién?</option>
                          {(
                            ["cliente", "segmento", "export", "linea"] as const
                          ).map((kind) => {
                            const group = priceLists.filter((item) => item.kind === kind);
                            if (group.length === 0) return null;
                            return (
                              <optgroup key={kind} label={PRICE_LIST_KIND_LABEL[kind]}>
                                {group.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {priceListOwner(item)}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                        {/* Moneda y país no se digitan: salen de a quién le vendes. */}
                        {list ? (
                          <p className="mt-1 text-[10.5px] text-muted-foreground">
                            {priceListContext(list)}
                          </p>
                        ) : null}
                      </div>
                      {(["sinIva", "conIva", "taxPercent"] as const).map((field) => (
                        <input
                          key={field}
                          className={numberClasses}
                          inputMode="decimal"
                          aria-label={
                            field === "sinIva"
                              ? `Precio sin IVA${list ? ` en ${list.currency}` : ""}`
                              : field === "conIva"
                                ? `Precio con IVA${list ? ` en ${list.currency}` : ""}`
                                : "Porcentaje de IVA"
                          }
                          value={row[field]}
                          onChange={(event) =>
                            setPrices((all) =>
                              all.map((item) =>
                                item.key === row.key
                                  ? { ...item, [field]: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setPrices((all) => all.filter((item) => item.key !== row.key))
                        }
                        className="h-[38px] rounded-lg border border-input bg-card text-xs font-bold text-muted-foreground hover:text-foreground"
                      >
                        Quitar
                      </button>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() =>
                    setPrices((all) => [
                      ...all,
                      {
                        key: nextKey(),
                        presentationKey: presentation.key,
                        priceListId: "",
                        sinIva: "",
                        conIva: "",
                        taxPercent: "",
                      },
                    ])
                  }
                  className="flex h-[30px] items-center gap-1.5 rounded-[7px] border border-dashed border-[#c2cbd6] bg-card px-2.5 text-[11.5px] font-bold text-[#0f5c8a] hover:bg-muted"
                >
                  + Agregar lista
                </button>
              </div>
            );
          })}

          <p className="text-[11.5px] text-muted-foreground">
            Sin precio en una lista = el producto no aplica ahí. No es un error.
          </p>
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        <section className="rounded-[11px] border border-border bg-card px-[18px] py-4">
          <h2 className="mb-3 text-[14.5px] font-extrabold text-foreground">Resumen</h2>
          {[
            ["Presentaciones", String(livePresentations.length)],
            ["Con precio asignado", `${new Set(prices.map((p) => p.priceListId).filter(Boolean)).size} de ${priceLists.length}`],
            ["Monedas", currencies.join(" · ") || "—"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between py-[5px] text-[13px] text-muted-foreground"
            >
              {label}
              <span className="font-semibold tabular-nums text-foreground">{value}</span>
            </div>
          ))}
        </section>

        <div className="flex flex-col gap-2.5">
          <button
            type="submit"
            disabled={saving}
            className="h-[42px] rounded-[9px] bg-[#0f5c8a] text-sm font-bold text-white shadow-[0_6px_16px_rgba(15,92,138,.25)] disabled:opacity-50"
          >
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear producto"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-10 rounded-[9px] border border-input bg-card text-[13px] font-bold text-foreground hover:bg-muted"
          >
            Cancelar
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-[10px] border border-[#f5dfb8] bg-[#fdf0dc] px-3.5 py-3">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#f58221]" />
          <span className="text-xs leading-relaxed text-[#6d4a10]">
            El campo <b>precio base</b> del modelo viejo ya no se edita aquí — el precio vive en
            las listas.
          </span>
        </div>
      </div>
    </form>
  );
}

async function messageOf(response: Response, action: string): Promise<string> {
  const data = await response.json().catch(() => ({}));
  return data?.message ?? `No se pudo ${action}.`;
}
