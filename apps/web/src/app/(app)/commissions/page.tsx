import Link from "next/link";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth.server";
import { apiFetch } from "@/lib/api.server";
import {
  netCommissionAmount,
  summarizeCommissions,
  type CommissionLiquidationRow,
} from "@/lib/commissions-summary";
import { CommissionsCsvButton } from "@/components/commissions/commissions-csv-button";
import { CommissionMarkPaidButton } from "@/components/commissions/mark-paid-button";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, type CrmStatusTone } from "@/components/ui/status-badge";

interface CommissionApiItem {
  id: string;
  sellerUserId: string;
  amount: string | number;
  reversedAmount: string | number;
  base: string | number;
  percent: string | number;
  status: "causada" | "reversada";
  paidAt: string | null;
  seller?: { id: string; name: string } | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    customer?: { id: string; displayName: string } | null;
  } | null;
  payment?: { id: string; paymentDate: string; amount: string | number } | null;
}

interface CommissionTableRow extends CommissionLiquidationRow {
  estado: "causada" | "pagada" | "reversada";
  canPay: boolean;
}

const estadoBadges: Record<
  CommissionTableRow["estado"],
  { label: string; tone: CrmStatusTone }
> = {
  causada: { label: "Causada", tone: "warning" },
  pagada: { label: "Pagada", tone: "success" },
  reversada: { label: "Reversada", tone: "danger" },
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

function formatPercent(percent: number) {
  return `${percent.toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
}

function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/dashboard");
  }

  // Espeja canAccess("/commissions"): el middleware redirige antes, pero la
  // pantalla no confia en la sesion para decidir columnas y acciones.
  const role: UserRole = currentUser.role;
  const canManage = role === "administrador" || role === "director_comercial";

  if (!canManage && role !== "comercial") {
    redirect("/dashboard");
  }

  // Default: mes en curso, igual que el reporte contable de cartera.
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  let from = isDay(params.from) ? params.from : monthStart;
  let to = isDay(params.to) ? params.to : today;
  if (from > to) [from, to] = [to, from];

  // El filtro de vendedor solo existe para direccion; el comercial llega con
  // las suyas porque el back le fuerza sellerUserId a su propio id.
  const sellerFilter = canManage ? firstParam(params, "sellerUserId") : undefined;

  const query = new URLSearchParams({ from, to });
  if (sellerFilter) {
    query.set("sellerUserId", sellerFilter);
  }

  const [commissionsResponse, sellersResponse] = await Promise.all([
    apiFetch(`/commissions?${query.toString()}`),
    canManage ? apiFetch("/users/sellers") : Promise.resolve(null),
  ]);

  const commissions = (
    commissionsResponse.ok ? await commissionsResponse.json() : []
  ) as CommissionApiItem[];

  const sellers = sellersResponse?.ok
    ? ((await sellersResponse.json()) as Array<{ id: string; name: string }>)
    : [];

  const rows: CommissionTableRow[] = commissions.map((commission) => {
    const net = netCommissionAmount(commission.amount, commission.reversedAmount);
    const estado: CommissionTableRow["estado"] = commission.paidAt
      ? "pagada"
      : commission.status === "reversada"
        ? "reversada"
        : "causada";

    return {
      id: commission.id,
      sellerName: commission.seller?.name ?? "Vendedor",
      invoiceId: commission.invoice?.id ?? null,
      invoiceNumber: commission.invoice?.invoiceNumber ?? null,
      customerName: commission.invoice?.customer?.displayName ?? null,
      paymentDate: (commission.payment?.paymentDate ?? "").slice(0, 10) || "—",
      base: Number(commission.base),
      percent: Number(commission.percent),
      amount: Number(commission.amount),
      reversedAmount: Number(commission.reversedAmount ?? 0),
      net,
      estado,
      estadoLabel: estadoBadges[estado].label,
      // Pendiente y con neto: lo unico que tiene sentido liquidar.
      canPay: !commission.paidAt && commission.status === "causada" && net > 0,
    };
  });

  const totals = summarizeCommissions(commissions);
  const badge = estadoBadges;

  // Direccion ve la columna de vendedor; para el comercial todas las filas son
  // suyas y la columna seria ruido.
  const columns: readonly DataTableColumn<CommissionTableRow>[] = [
    ...(canManage
      ? [
          {
            key: "seller",
            header: "Vendedor",
            render: (row: CommissionTableRow) => row.sellerName,
          },
        ]
      : []),
    {
      key: "invoice",
      header: "Factura",
      render: (row) =>
        row.invoiceId ? (
          <Link
            href={`/invoices/${row.invoiceId}`}
            style={{ color: "#0f5c8a", textDecoration: "none", fontWeight: 600 }}
          >
            {row.invoiceNumber ?? row.invoiceId}
          </Link>
        ) : (
          (row.invoiceNumber ?? "—")
        ),
    },
    {
      key: "customer",
      header: "Cliente",
      render: (row) => row.customerName ?? "—",
    },
    {
      key: "paymentDate",
      header: "Fecha pago",
      render: (row) => row.paymentDate,
    },
    {
      key: "base",
      header: "Base cobrada",
      align: "right",
      render: (row) => formatCurrency(row.base),
    },
    {
      key: "percent",
      header: "%",
      align: "right",
      render: (row) => formatPercent(row.percent),
    },
    {
      key: "amount",
      header: "Comisión",
      align: "right",
      render: (row) => formatCurrency(row.amount),
    },
    {
      key: "reversed",
      header: "Revertido",
      align: "right",
      render: (row) => (row.reversedAmount > 0 ? formatCurrency(row.reversedAmount) : "—"),
    },
    {
      key: "net",
      header: "Neto",
      align: "right",
      render: (row) => <strong>{formatCurrency(row.net)}</strong>,
    },
    {
      key: "estado",
      header: "Estado",
      render: (row) => (
        <StatusBadge tone={badge[row.estado].tone}>{badge[row.estado].label}</StatusBadge>
      ),
    },
    ...(canManage
      ? [
          {
            key: "acciones",
            header: "",
            render: (row: CommissionTableRow) =>
              row.canPay ? <CommissionMarkPaidButton commissionId={row.id} /> : null,
          },
        ]
      : []),
  ] as const;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Comercial"
        title={`Comisiones · ${from} a ${to}`}
        description={
          canManage
            ? "Liquidación de comisiones causadas al cobrar. Marca como pagadas las que ya le entraron al vendedor."
            : "Tus comisiones causadas al cobrar cada factura, con lo revertido por notas crédito y lo ya liquidado."
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        <StatCard
          label="Por liquidar"
          value={formatCurrency(totals.pendiente)}
          tone="warning"
        />
        <StatCard
          label="Liquidada"
          value={formatCurrency(totals.pagada)}
          tone="success"
        />
        <StatCard
          label="Revertido"
          value={formatCurrency(totals.revertido)}
          tone="info"
        />
      </div>

      <form
        method="get"
        style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" }}
      >
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Desde
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Hasta
          <input type="date" name="to" defaultValue={to} />
        </label>
        {canManage ? (
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
            Vendedor
            <select
              name="sellerUserId"
              defaultValue={sellerFilter ?? ""}
              style={{ minWidth: 180 }}
            >
              <option value="">Todos los vendedores</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
      </form>

      <SectionCard
        title="Comisiones del periodo"
        description="Causada al cobrar cada pago, proporcional al recaudo. El CSV trae lo que se está viendo."
        actions={<CommissionsCsvButton rows={rows} from={from} to={to} />}
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="Sin comisiones"
              description="No hay comisiones causadas en el periodo seleccionado con los filtros aplicados."
            />
          }
        />
      </SectionCard>
    </div>
  );
}
