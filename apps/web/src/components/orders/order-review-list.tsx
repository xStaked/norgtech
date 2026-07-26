"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  Clock,
  Lock,
  MessageCircle,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { apiFetchClient } from "@/lib/api.client";
import { avatarColor, initials } from "@/lib/avatar";
import { formatMoney } from "@/lib/pricing-preview";
import { usePricingPreview } from "@/lib/use-pricing-preview";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReviewItem {
  id: string;
  productSnapshotName: string | null;
  customProductName: string | null;
  quantity: string;
  needsResolution: boolean;
}

interface ReviewOrder {
  id: string;
  orderNumber: string | null;
  customerId: string;
  customerNameSnapshot: string | null;
  customerNitSnapshot: string | null;
  billingCompanyNameSnapshot: string | null;
  requesterName: string | null;
  total: string;
  createdAt: string;
  sourceConversationId: string | null;
  items: ReviewItem[];
  customer: { id: string; displayName: string } | null;
  company: { id: string; name: string; prefix: string } | null;
  seller: { id: string; name: string } | null;
  credit: {
    creditLimit: number | null;
    availableCredit: number | null;
    exceedsCredit: boolean;
  };
}

interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

type Tab = "blocked" | "ready" | "all";
type Sort = "oldest" | "newest" | "amount";

const HOUR_MS = 3_600_000;

/**
 * La antiguedad es urgencia, no una fecha: al otro lado hay un cliente que
 * escribio por WhatsApp y sigue esperando. A las 2 h amarillo, a las 6 h rojo.
 */
function ageOf(createdAt: string) {
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const hours = elapsed / HOUR_MS;
  const label =
    hours < 1
      ? `hace ${Math.max(1, Math.round(elapsed / 60_000))} min`
      : hours < 24
        ? `hace ${Math.floor(hours)} h`
        : `hace ${Math.floor(hours / 24)} d`;

  if (hours >= 6) return { hours, label, fg: "#b42318", bg: "#fcebe9", accent: "#ee1c25" };
  if (hours >= 2) return { hours, label, fg: "#9a6410", bg: "#fdf0dc", accent: "#f58221" };
  return { hours, label, fg: "#5b6b80", bg: "#eef1f5", accent: "#c2cbd6" };
}

function folioOf(order: ReviewOrder) {
  return order.orderNumber ?? `#${order.id.slice(-6)}`;
}

function customerOf(order: ReviewOrder) {
  return order.customerNameSnapshot ?? order.customer?.displayName ?? "Sin cliente";
}

function unresolvedOf(order: ReviewOrder) {
  return order.items.filter((item) => item.needsResolution);
}

function itemLabel(item: ReviewItem) {
  return item.customProductName ?? item.productSnapshotName ?? "Ítem sin nombre";
}

function quantityLabel(quantity: string) {
  return Number(quantity).toLocaleString("es-CO");
}

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function OrderReviewList() {
  const [orders, setOrders] = useState<ReviewOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [seller, setSeller] = useState("");
  const [sort, setSort] = useState<Sort>("oldest");

  const [resolving, setResolving] = useState<{ orderId: string; itemId: string } | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await apiFetchClient("/orders/review-queue");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError((data as { message?: string }).message || "Error al cargar la cola de revisión");
        return;
      }
      const data: ReviewOrder[] = await response.json();
      setOrders(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const blocked = orders.filter((order) => unresolvedOf(order).length > 0);
  const ready = orders.filter((order) => unresolvedOf(order).length === 0);
  const unresolvedTotal = blocked.reduce((sum, order) => sum + unresolvedOf(order).length, 0);
  const heldAmount = orders.reduce((sum, order) => sum + Number(order.total), 0);
  const oldest = orders.reduce<string | null>(
    (acc, order) => (acc == null || order.createdAt < acc ? order.createdAt : acc),
    null,
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const pool = tab === "blocked" ? blocked : tab === "ready" ? ready : orders;

    const filtered = pool.filter((order) => {
      if (company && (order.company?.name ?? order.billingCompanyNameSnapshot) !== company) {
        return false;
      }
      if (seller && (order.seller?.name ?? "") !== seller) return false;
      if (!term) return true;
      return [folioOf(order), customerOf(order), order.customerNitSnapshot ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });

    return [...filtered].sort((a, b) => {
      if (sort === "amount") return Number(b.total) - Number(a.total);
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      return a.createdAt.localeCompare(b.createdAt);
    });
    // `blocked`/`ready` se derivan de `orders`, no hace falta listarlos aparte.
  }, [orders, tab, search, company, seller, sort]);

  const companyOptions = useMemo(
    () =>
      Array.from(
        new Set(
          orders
            .map((order) => order.company?.name ?? order.billingCompanyNameSnapshot)
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort(),
    [orders],
  );

  const sellerOptions = useMemo(
    () =>
      Array.from(
        new Set(orders.map((order) => order.seller?.name).filter((name): name is string => Boolean(name))),
      ).sort(),
    [orders],
  );

  const resolvingOrder = orders.find((order) => order.id === resolving?.orderId) ?? null;
  const resolvingItem = resolvingOrder?.items.find((item) => item.id === resolving?.itemId) ?? null;
  const approvingOrder = orders.find((order) => order.id === approving) ?? null;
  const rejectingOrder = orders.find((order) => order.id === rejecting) ?? null;

  /**
   * Resolver encadena: el revisor casi nunca tiene un solo item roto, y volver
   * a la lista entre uno y otro le cuesta dos clics por item.
   */
  async function afterResolve(orderId: string, itemId: string) {
    const order = orders.find((candidate) => candidate.id === orderId);
    const next = order ? unresolvedOf(order).find((item) => item.id !== itemId) : undefined;
    await load();
    setResolving(next ? { orderId, itemId: next.id } : null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.1em] text-[#9aa3b1]">Comercial</div>
          <h1 className="mt-0.5 text-[22px] font-extrabold tracking-[-.02em] text-foreground">
            Revisión de pedidos
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#6b7787]">
            <MessageCircle className="size-3.5 text-[#25d366]" aria-hidden="true" />
            Pedidos creados por Nora desde WhatsApp. No existen comercialmente hasta que los apruebes.
          </p>
        </div>
        <Button variant="outline" size="lg" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
          Actualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="En cola" value={String(orders.length)} hint="pedidos esperando decisión" rainbow />
        <Kpi
          label="Bloqueados por ítems"
          value={String(blocked.length)}
          valueColor="#9a6410"
          dot="#f58221"
          hint={`${unresolvedTotal} ${unresolvedTotal === 1 ? "ítem" : "ítems"} sin resolver en total`}
        />
        <Kpi
          label="Listos para aprobar"
          value={String(ready.length)}
          valueColor="#167c4a"
          dot="#00a651"
          hint="sin ítems pendientes"
        />
        <Kpi
          label="Monto represado"
          value={formatMoney(heldAmount)}
          hint={
            oldest ? (
              <>
                el más antiguo lleva{" "}
                <b style={{ color: ageOf(oldest).fg }}>{ageOf(oldest).label.replace("hace ", "")}</b>
              </>
            ) : (
              "nada en espera"
            )
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-5 border-b border-border">
        <TabButton
          active={tab === "blocked"}
          onClick={() => setTab("blocked")}
          dot="#f58221"
          label="Necesitan resolución"
          count={blocked.length}
          countFg="#9a6410"
          countBg="#fdf0dc"
        />
        <TabButton
          active={tab === "ready"}
          onClick={() => setTab("ready")}
          dot="#00a651"
          label="Listos para aprobar"
          count={ready.length}
          countFg="#167c4a"
          countBg="#e6f4ec"
        />
        <TabButton
          active={tab === "all"}
          onClick={() => setTab("all")}
          dot="#b3bcc8"
          label="Todos"
          count={orders.length}
          countFg="#7a8696"
          countBg="#eef1f5"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-[250px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9aa3b1]"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar pedido o cliente…"
            aria-label="Buscar pedido o cliente"
            className="h-8 w-full rounded-lg border border-input bg-transparent pl-9 pr-3 text-[12.5px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="w-[190px]">
          <Select
            value={company}
            onValueChange={setCompany}
            options={[
              { value: "", label: "Empresa: todas" },
              ...companyOptions.map((name) => ({ value: name, label: name })),
            ]}
          />
        </div>
        {sellerOptions.length > 0 && (
          <div className="w-[180px]">
            <Select
              value={seller}
              onValueChange={setSeller}
              options={[
                { value: "", label: "Vendedor: todos" },
                ...sellerOptions.map((name) => ({ value: name, label: name })),
              ]}
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11.5px] text-[#8a93a1]">Ordenar por</span>
          <div className="w-[190px]">
            <Select
              value={sort}
              onValueChange={(value) => setSort(value as Sort)}
              options={[
                { value: "oldest", label: "Más antiguo primero" },
                { value: "newest", label: "Más reciente primero" },
                { value: "amount", label: "Mayor monto" },
              ]}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <QueueSkeleton />
      ) : visible.length === 0 ? (
        <EmptyQueue filtered={orders.length > 0} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              onResolve={(itemId) => setResolving({ orderId: order.id, itemId })}
              onApprove={() => setApproving(order.id)}
              onReject={() => setRejecting(order.id)}
            />
          ))}
        </div>
      )}

      {resolvingOrder && resolvingItem && (
        <ResolveDialog
          order={resolvingOrder}
          item={resolvingItem}
          onClose={() => setResolving(null)}
          onResolved={() => afterResolve(resolvingOrder.id, resolvingItem.id)}
        />
      )}

      {approvingOrder && (
        <ApproveDialog
          order={approvingOrder}
          onClose={() => setApproving(null)}
          onDone={async () => {
            setApproving(null);
            await load();
          }}
        />
      )}

      {rejectingOrder && (
        <RejectDialog
          order={rejectingOrder}
          onClose={() => setRejecting(null)}
          onDone={async () => {
            setRejecting(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  dot,
  valueColor,
  rainbow,
}: {
  label: string;
  value: string;
  hint: React.ReactNode;
  dot?: string;
  valueColor?: string;
  rainbow?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-[10px] border border-border bg-card px-4 py-3.5">
      {rainbow && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background:
              "linear-gradient(90deg,#00a651,#a7ce39,#0288c4,#ffcb06,#f58221,#ee1c25)",
          }}
        />
      )}
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6b7787]">
        {dot && (
          <span
            aria-hidden="true"
            className="size-[7px] rounded-full"
            style={{ backgroundColor: dot }}
          />
        )}
        {label}
      </div>
      <div
        className="mt-1.5 text-[23px] font-extrabold tracking-[-.02em] tabular-nums"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-[#9aa3b1]">{hint}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  dot,
  label,
  count,
  countFg,
  countBg,
}: {
  active: boolean;
  onClick: () => void;
  dot: string;
  label: string;
  count: number;
  countFg: string;
  countBg: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 border-b-2 pb-2.5 text-[13px] transition-colors ${
        active
          ? "border-[#0f5c8a] font-bold text-foreground"
          : "border-transparent font-medium text-[#6b7787] hover:text-foreground"
      }`}
    >
      <span aria-hidden="true" className="size-[7px] rounded-full" style={{ backgroundColor: dot }} />
      {label}
      <span
        className="rounded-full px-1.5 text-[11px] font-bold tabular-nums"
        style={active ? { color: countFg, background: countBg } : { color: "#7a8696", background: "#eef1f5" }}
      >
        {count}
      </span>
    </button>
  );
}

function OrderRow({
  order,
  onResolve,
  onApprove,
  onReject,
}: {
  order: ReviewOrder;
  onResolve: (itemId: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const age = ageOf(order.createdAt);
  const unresolved = unresolvedOf(order);
  const isBlocked = unresolved.length > 0;
  const customer = customerOf(order);
  const preview = order.items
    .slice(0, 3)
    .map((item) => itemLabel(item))
    .join(" · ");

  return (
    <div
      className="flex overflow-hidden rounded-[11px] border bg-card transition-all hover:border-[#c7d3df] hover:shadow-[0_6px_18px_rgba(12,44,68,.08)]"
      style={{ borderColor: isBlocked ? "#f0e3cd" : undefined }}
    >
      <div aria-hidden="true" className="w-1 shrink-0" style={{ backgroundColor: age.accent }} />
      <div className="flex flex-1 flex-wrap items-start gap-3.5 p-3.5 lg:flex-nowrap">
        <div className="w-[190px] shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12.5px] font-bold text-[#0f5c8a]">{folioOf(order)}</span>
            {order.sourceConversationId && (
              <span className="inline-flex items-center gap-1 rounded bg-[#e6f4ec] px-1.5 text-[9.5px] font-extrabold text-[#167c4a]">
                <MessageCircle className="size-2.5" aria-hidden="true" />
                Nora
              </span>
            )}
          </div>
          <span
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-extrabold"
            style={{ background: age.bg, color: age.fg }}
          >
            <Clock className="size-3" aria-hidden="true" />
            {age.label}
          </span>
          <div className="mt-1 text-[10.5px] text-[#9aa3b1]">
            {dateFormatter.format(new Date(order.createdAt))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] text-[10px] font-bold text-white"
              style={{ backgroundColor: avatarColor(customer) }}
            >
              {initials(customer)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-bold text-foreground">{customer}</div>
              <div className="truncate text-[10.5px] text-[#9aa3b1]">
                {[
                  order.customerNitSnapshot ? `NIT ${order.customerNitSnapshot}` : null,
                  order.requesterName ? `pidió ${order.requesterName}` : null,
                  order.seller?.name ?? null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </div>
            </div>
          </div>

          {isBlocked ? (
            <div className="mt-2.5 rounded-lg border border-[#f5dfb8] bg-[#fdf0dc] px-3 py-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold text-[#9a6410]">
                <TriangleAlert className="size-3" aria-hidden="true" />
                NORA NO RECONOCIÓ {unresolved.length}{" "}
                {unresolved.length === 1 ? "PRODUCTO" : "PRODUCTOS"}
              </div>
              {unresolved.map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-0.5">
                  <span className="truncate text-xs italic text-foreground">“{itemLabel(item)}”</span>
                  <span className="whitespace-nowrap text-[10.5px] text-[#9a6410]">
                    × {quantityLabel(item.quantity)}
                  </span>
                  <Button
                    size="sm"
                    className="ml-auto bg-[#0f5c8a] text-white hover:bg-[#0f5c8a]/90"
                    onClick={() => onResolve(item.id)}
                  >
                    Resolver
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-[#6b7787]">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#167c4a]">
                <Check className="size-3" aria-hidden="true" />
                Todos los ítems mapeados
              </span>
              <span className="text-[#d5dbe3]">·</span>
              <span>
                {order.items.length} {order.items.length === 1 ? "ítem" : "ítems"}
              </span>
              {preview && (
                <>
                  <span className="text-[#d5dbe3]">·</span>
                  <span className="truncate">{preview}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="w-[140px] shrink-0 text-right">
          <div className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
            {formatMoney(Number(order.total))}
          </div>
          <div className="mt-0.5 text-[10.5px] text-[#9aa3b1]">
            {order.company?.name ?? order.billingCompanyNameSnapshot ?? "—"}
          </div>
          {order.credit.exceedsCredit && (
            <span className="mt-1 inline-flex items-center gap-1 rounded bg-[#fcebe9] px-1.5 text-[9.5px] font-extrabold text-[#b42318]">
              <CircleAlert className="size-2.5" aria-hidden="true" />
              Excede cupo
            </span>
          )}
        </div>

        <div className="flex w-[172px] shrink-0 flex-col gap-1.5">
          {isBlocked ? (
            <Button size="lg" disabled title="Resuelve los ítems pendientes para poder aprobar">
              <Lock aria-hidden="true" />
              Aprobar
            </Button>
          ) : (
            <Button
              size="lg"
              className="bg-[#00a651] text-white hover:bg-[#00a651]/90"
              onClick={onApprove}
            >
              <Check aria-hidden="true" />
              Aprobar
            </Button>
          )}
          <div className="flex gap-1.5">
            <Button variant="outline" className="flex-1" render={<Link href={`/orders/${order.id}`} />}>
              Ver pedido
            </Button>
            {order.sourceConversationId && (
              <Button
                variant="outline"
                size="icon"
                title="Ver conversación"
                render={<Link href={`/whatsapp?c=${order.sourceConversationId}`} />}
              >
                <MessageCircle className="text-[#25d366]" aria-hidden="true" />
                <span className="sr-only">Ver conversación</span>
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="self-center text-[#b42318] hover:text-[#b42318]"
            onClick={onReject}
          >
            Rechazar
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyQueue({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-8 py-12 text-center">
      <div className="mx-auto mb-3.5 flex size-[58px] items-center justify-center rounded-[15px] bg-[#e6f4ec]">
        <Check className="size-6 text-[#167c4a]" aria-hidden="true" />
      </div>
      <div className="text-base font-extrabold text-foreground">
        {filtered ? "Ningún pedido coincide con los filtros" : "Cola vacía"}
      </div>
      <p className="mx-auto mt-1.5 max-w-[340px] text-[13px] leading-relaxed text-[#6b7787]">
        {filtered
          ? "Cambia la pestaña o limpia la búsqueda para ver el resto de la cola."
          : "No hay pedidos esperando revisión. Cuando Nora cree uno desde WhatsApp, aparecerá aquí."}
      </p>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Cargando pedidos en revisión">
      {[150, 190, 128].map((width) => (
        <div key={width} className="flex overflow-hidden rounded-[11px] border border-border bg-card">
          <div className="w-1 shrink-0 bg-muted" />
          <div className="flex flex-1 items-center gap-3.5 p-3.5">
            <div className="w-[150px] shrink-0 space-y-2">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-2 w-14 rounded bg-muted/60" />
            </div>
            <div className="flex flex-1 items-center gap-2.5">
              <div className="size-[26px] shrink-0 rounded-[7px] bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded bg-muted" style={{ width }} />
                <div className="h-2 w-24 rounded bg-muted/60" />
              </div>
            </div>
            <div className="h-3 w-[88px] shrink-0 rounded bg-muted" />
            <div className="h-8 w-[150px] shrink-0 rounded-lg bg-muted/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResolveDialog({
  order,
  item,
  onClose,
  onResolved,
}: {
  order: ReviewOrder;
  item: ReviewItem;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productId, setProductId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantity = Number(item.quantity);
  const unresolved = unresolvedOf(order);
  const remaining = unresolved.length - 1;

  // Solo el catalogo con precio en la lista del cliente: resolver contra un
  // producto que ese cliente no tiene tarifado falla al tarifar la linea.
  useEffect(() => {
    let cancelled = false;
    apiFetchClient(`/products?customerId=${order.customerId}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: CatalogProduct[]) => {
        if (!cancelled) setProducts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el catálogo del cliente");
      });
    return () => {
      cancelled = true;
    };
  }, [order.customerId]);

  // El precio lo pone la lista del cliente, no el revisor: resolveOrderItem
  // ignora el unitPrice enviado y re-tarifa la linea. Se muestra el mismo
  // numero que va a quedar guardado.
  const { preview, loading: pricing, error: pricingError } = usePricingPreview(
    "/orders/preview",
    productId ? order.customerId : "",
    productId ? [{ productId, quantity, unitPrice: 0 }] : [],
  );
  const line = preview?.lines[0] ?? null;

  async function submit() {
    if (!line) return;
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetchClient(`/orders/${order.id}/items/${item.id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ productId, unitPrice: line.unitPrice }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError((data as { message?: string }).message || "No se pudo resolver el ítem");
        return;
      }
      setProductId("");
      onResolved();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <div>
          <DialogTitle>Resolver ítem</DialogTitle>
          <DialogDescription className="mt-1">
            {folioOf(order)} · {customerOf(order)} ·{" "}
            {unresolved.length === 1 ? "último ítem" : `${unresolved.length} ítems sin resolver`}
          </DialogDescription>
        </div>

        <div className="rounded-[9px] border border-border bg-muted/40 px-3.5 py-3">
          <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-[.06em] text-[#8a93a1]">
            Lo que escribió el cliente
          </div>
          <div className="flex items-center gap-2.5">
            <MessageCircle className="size-4 shrink-0 text-[#25d366]" aria-hidden="true" />
            <span className="flex-1 text-sm italic text-foreground">“{itemLabel(item)}”</span>
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-bold text-[#6b7787]">
              × {quantityLabel(item.quantity)}
            </span>
          </div>
          {(order.requesterName || order.sourceConversationId) && (
            <div className="mt-1.5 text-[11px] text-[#9aa3b1]">
              {order.requesterName ? `${order.requesterName} · ` : ""}
              {dateFormatter.format(new Date(order.createdAt))}
              {order.sourceConversationId && (
                <>
                  {" · "}
                  <Link
                    href={`/whatsapp?c=${order.sourceConversationId}`}
                    className="font-bold text-[#0f5c8a] hover:underline"
                  >
                    ver conversación
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-1.5">
          <label className="text-[11.5px] font-semibold text-[#6b7787]" htmlFor="resolve-product">
            Producto del catálogo <span className="text-[#b42318]">*</span>
          </label>
          <Select
            id="resolve-product"
            size="lg"
            value={productId}
            onValueChange={setProductId}
            placeholder="Seleccionar producto"
            searchPlaceholder="Buscar producto o SKU…"
            emptyMessage="Este cliente no tiene productos con precio en su lista."
            options={products.map((product) => ({
              value: product.id,
              label: product.name,
              meta: `${product.sku} · ${product.unit}`,
            }))}
          />
        </div>

        <div className="rounded-[9px] border border-[#cfe0ea] bg-[#eff4fb] px-3.5 py-3">
          {!productId ? (
            <p className="text-[12.5px] text-[#3f6a86]">
              Elige el producto y aquí aparece el precio de la lista del cliente.
            </p>
          ) : pricing ? (
            <p className="text-[12.5px] text-[#3f6a86]">Calculando precio…</p>
          ) : pricingError ? (
            <p className="text-[12.5px] font-semibold text-destructive">{pricingError}</p>
          ) : line ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-[12.5px] font-semibold text-[#3f6a86]">
                  Precio unitario · {quantityLabel(item.quantity)} × {formatMoney(line.unitPrice)}
                </span>
                <span className="font-mono text-base font-bold tabular-nums text-foreground">
                  {formatMoney(line.subtotal)}
                </span>
              </div>
              <div className="mt-1 text-[10.5px] text-[#6b7787]">
                {preview?.segmentName ? `Segmento ${preview.segmentName} · ` : ""}
                {line.discountPercent > 0 ? `descuento ${line.discountPercent}% · ` : ""}
                subtotal sin IVA · lo tarifa la lista del cliente, no se edita aquí
              </div>
            </>
          ) : null}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11.5px] text-[#8a93a1]">
            {remaining > 0
              ? `Quedan ${remaining} ${remaining === 1 ? "ítem" : "ítems"} sin resolver en este pedido`
              : "Es el último ítem sin resolver"}
          </span>
          <Button variant="outline" size="lg" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="lg" onClick={() => void submit()} disabled={saving || !line}>
            <Check aria-hidden="true" />
            {saving ? "Resolviendo…" : remaining > 0 ? "Resolver y siguiente" : "Resolver"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({
  order,
  onClose,
  onDone,
}: {
  order: ReviewOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Number(order.total);
  const { availableCredit, exceedsCredit } = order.credit;

  async function approve() {
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetchClient(`/orders/${order.id}/approve`, { method: "PATCH" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError((data as { message?: string }).message || "No se pudo aprobar");
        return;
      }
      onDone();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#e6f4ec]">
            <Check className="size-5 text-[#167c4a]" aria-hidden="true" />
          </span>
          <div>
            <DialogTitle>Aprobar {folioOf(order)}</DialogTitle>
            <DialogDescription className="mt-1">
              Pasa a <b className="text-foreground">orden de facturación</b> y compromete cupo de
              crédito.
            </DialogDescription>
          </div>
        </div>

        <div className="overflow-hidden rounded-[9px] border border-border text-[12.5px]">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 py-2.5">
            <span className="font-bold text-foreground">{customerOf(order)}</span>
            <span className="text-[11px] text-[#9aa3b1]">
              {order.items.length} {order.items.length === 1 ? "ítem" : "ítems"}
            </span>
          </div>
          <Line label="Total del pedido" value={formatMoney(total)} />
          <Line
            label="Cupo disponible"
            value={availableCredit == null ? "Sin límite" : formatMoney(availableCredit)}
            valueColor={availableCredit == null ? undefined : exceedsCredit ? "#b42318" : "#167c4a"}
          />
          {availableCredit != null && (
            <Line
              label="Cupo tras aprobar"
              value={formatMoney(availableCredit - total)}
              highlight
            />
          )}
        </div>

        {exceedsCredit && (
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-destructive">
            <CircleAlert className="size-3.5" aria-hidden="true" />
            El total supera el cupo disponible: el sistema rechazará la aprobación.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="lg" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="lg"
            className="bg-[#00a651] text-white hover:bg-[#00a651]/90"
            onClick={() => void approve()}
            disabled={saving || exceedsCredit}
          >
            <Check aria-hidden="true" />
            {saving ? "Aprobando…" : "Aprobar pedido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Line({
  label,
  value,
  valueColor,
  highlight,
}: {
  label: string;
  value: string;
  valueColor?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-t border-border px-3.5 py-2.5 first:border-t-0 ${
        highlight ? "bg-muted/30" : ""
      }`}
    >
      <span className={highlight ? "font-semibold text-foreground" : "text-[#6b7787]"}>{label}</span>
      <span className="font-mono font-bold tabular-nums" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

const REJECT_REASONS = [
  "Excede cupo de crédito",
  "Producto sin stock",
  "Cliente inactivo",
  "Precio no autorizado",
];

function RejectDialog({
  order,
  onClose,
  onDone,
}: {
  order: ReviewOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reject() {
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetchClient(`/orders/${order.id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError((data as { message?: string }).message || "No se pudo rechazar");
        return;
      }
      onDone();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#fcebe9] text-lg font-bold text-[#b42318]">
            ×
          </span>
          <div>
            <DialogTitle>Rechazar {folioOf(order)}</DialogTitle>
            <DialogDescription className="mt-1">
              El motivo se le envía al cliente por WhatsApp. Es obligatorio.
            </DialogDescription>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {REJECT_REASONS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setReason(preset)}
              className="rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold text-[#3a4658] transition-colors hover:border-[#0f5c8a] hover:text-[#0f5c8a]"
            >
              {preset}
            </button>
          ))}
        </div>

        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Describe el motivo del rechazo…"
          aria-label="Motivo del rechazo"
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11.5px] text-[#8a93a1]">
            El pedido queda registrado como rechazado, no se elimina.
          </span>
          <Button variant="outline" size="lg" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="lg"
            className="bg-[#ee1c25] text-white hover:bg-[#ee1c25]/90"
            onClick={() => void reject()}
            disabled={saving || !reason.trim()}
          >
            {saving ? "Rechazando…" : "Rechazar pedido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
