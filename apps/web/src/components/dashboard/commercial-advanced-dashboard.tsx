import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, MapPinned, Package, Repeat, Trophy, Users } from "lucide-react";
import { formatPercent } from "@/lib/labels";
import type { ReactNode } from "react";

type Money = number;

interface CommercialSummaryWindow {
  days: number;
  from: string;
  to: string;
}

interface CommercialTotals {
  orders: number;
  revenue: Money;
  units: number;
  customers: number;
  products: number;
  returns: Money;
  netRevenue: Money;
}

interface SellerBreakdown {
  sellerId: string | null;
  sellerName: string;
  orders: number;
  revenue: Money;
  customers: number;
  returns: Money;
  netRevenue: Money;
}

interface RepurchaseCustomer {
  customerId: string;
  customerName: string;
  orders: number;
}

interface RepurchaseSummary {
  repeatCount: number;
  noRepurchaseCount: number;
  repurchaseRate: number;
  repeatCustomers: RepurchaseCustomer[];
  noRepurchaseCustomers: RepurchaseCustomer[];
}

interface CustomerRankingItem {
  rank: number;
  customerId: string;
  customerName: string;
  orders: number;
  revenue: Money;
  lastOrderDate: string | null;
}

interface ProductBreakdown {
  productId: string | null;
  sku: string;
  name: string;
  quantity: number;
  revenue: Money;
  orders: number;
  lastOrderDate: string | null;
}

interface ZoneBreakdown {
  zone: string;
  orders: number;
  revenue: Money;
  customers: number;
}

interface DormantCustomer {
  customerId: string;
  customerName: string;
  sellerId: string | null;
  sellerName: string;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
}

export interface CommercialAdvancedSummary {
  window: CommercialSummaryWindow;
  totals: CommercialTotals;
  bySeller: SellerBreakdown[];
  byCustomer: CustomerRankingItem[];
  byProduct: ProductBreakdown[];
  byZone: ZoneBreakdown[];
  customerRanking: CustomerRankingItem[];
  lowRotationProducts: ProductBreakdown[];
  dormantCustomers: DormantCustomer[];
  repurchase: RepurchaseSummary;
}

interface CommercialAdvancedDashboardProps {
  summary: CommercialAdvancedSummary | null;
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(Math.round(value));
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Sin compras";
  return dateFormatter.format(new Date(value));
}

function topItems<T>(items: T[], count = 5) {
  return items.slice(0, count);
}

export function CommercialAdvancedDashboard({ summary }: CommercialAdvancedDashboardProps) {
  if (!summary) return null;

  const totals = summary.totals;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Control comercial avanzado</CardTitle>
            <CardDescription>
              Ventas, rotación y cobertura comercial de los últimos {summary.window.days} días.
            </CardDescription>
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDate(summary.window.from)} - {formatDate(summary.window.to)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Ingresos" value={formatCurrency(totals.revenue)} />
          <Metric label="Devoluciones" value={formatCurrency(totals.returns ?? 0)} />
          <Metric label="Ingreso neto" value={formatCurrency(totals.netRevenue ?? totals.revenue)} />
          <Metric label="Pedidos" value={totals.orders.toLocaleString("es-CO")} />
          <Metric label="Clientes" value={totals.customers.toLocaleString("es-CO")} />
          <Metric label="Unidades" value={formatNumber(totals.units)} />
          <Metric label="Productos" value={totals.products.toLocaleString("es-CO")} />
          {summary.repurchase && (
            <Metric
              label="Recompra"
              value={formatPercent(summary.repurchase.repurchaseRate)}
            />
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel icon={<Users className="h-4 w-4" />} title="Ventas por vendedor">
            <Table>
              <thead>
                <tr>
                  <Th>Vendedor</Th>
                  <Th align="right">Ingresos</Th>
                  <Th align="right">Devol.</Th>
                  <Th align="right">Neto</Th>
                  <Th align="right">Pedidos</Th>
                </tr>
              </thead>
              <tbody>
                {topItems(summary.bySeller).map((seller) => (
                  <tr key={seller.sellerId ?? "unassigned"} className="border-t border-border/60">
                    <Td>{seller.sellerName}</Td>
                    <Td align="right">{formatCurrency(seller.revenue)}</Td>
                    <Td align="right">{formatCurrency(seller.returns ?? 0)}</Td>
                    <Td align="right">{formatCurrency(seller.netRevenue ?? seller.revenue)}</Td>
                    <Td align="right">{seller.orders}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel icon={<Trophy className="h-4 w-4" />} title="Ranking de clientes">
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th align="right">Ingresos</Th>
                  <Th align="right">Ultima compra</Th>
                </tr>
              </thead>
              <tbody>
                {topItems(summary.customerRanking).map((customer) => (
                  <tr key={customer.customerId} className="border-t border-border/60">
                    <Td>
                      <span className="mr-2 text-xs text-muted-foreground">#{customer.rank}</span>
                      {customer.customerName}
                    </Td>
                    <Td align="right">{formatCurrency(customer.revenue)}</Td>
                    <Td align="right">{formatDate(customer.lastOrderDate)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel icon={<Package className="h-4 w-4" />} title="Productos de baja rotacion">
            <Table>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th align="right">Unidades</Th>
                  <Th align="right">Ultima venta</Th>
                </tr>
              </thead>
              <tbody>
                {topItems(summary.lowRotationProducts).map((product) => (
                  <tr
                    key={product.productId ?? `${product.sku}:${product.name}`}
                    className="border-t border-border/60"
                  >
                    <Td>
                      <div className="font-medium">{product.name}</div>
                      <div className="text-xs text-muted-foreground">{product.sku}</div>
                    </Td>
                    <Td align="right">{formatNumber(product.quantity)}</Td>
                    <Td align="right">{formatDate(product.lastOrderDate)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel icon={<AlertCircle className="h-4 w-4" />} title="Clientes dormidos">
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Vendedor</Th>
                  <Th align="right">Dias</Th>
                </tr>
              </thead>
              <tbody>
                {topItems(summary.dormantCustomers).map((customer) => (
                  <tr key={customer.customerId} className="border-t border-border/60">
                    <Td>{customer.customerName}</Td>
                    <Td>{customer.sellerName}</Td>
                    <Td align="right">
                      {customer.daysSinceLastOrder === null
                        ? "Sin compras"
                        : customer.daysSinceLastOrder}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </div>

        {summary.repurchase && (
          <Panel icon={<Repeat className="h-4 w-4" />} title="Recompra de clientes">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground">Tasa recompra</div>
                <div className="mt-1 text-lg font-semibold">
                  {formatPercent(summary.repurchase.repurchaseRate)}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground">Recompraron</div>
                <div className="mt-1 text-lg font-semibold">
                  {summary.repurchase.repeatCount.toLocaleString("es-CO")}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground">Una sola compra</div>
                <div className="mt-1 text-lg font-semibold">
                  {summary.repurchase.noRepurchaseCount.toLocaleString("es-CO")}
                </div>
              </div>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Cliente sin recompra</Th>
                  <Th align="right">Pedidos</Th>
                </tr>
              </thead>
              <tbody>
                {topItems(summary.repurchase.noRepurchaseCustomers).map((customer) => (
                  <tr key={customer.customerId} className="border-t border-border/60">
                    <Td>{customer.customerName}</Td>
                    <Td align="right">{customer.orders}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        )}

        <Panel icon={<MapPinned className="h-4 w-4" />} title="Cobertura por zona">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {topItems(summary.byZone, 8).map((zone) => (
              <div
                key={zone.zone}
                className="rounded-lg border border-border/60 bg-background/40 p-3"
              >
                <div className="truncate text-sm font-medium">{zone.zone}</div>
                <div className="mt-2 text-base font-semibold">{formatCurrency(zone.revenue)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {zone.orders} pedidos / {zone.customers} clientes
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">{children}</table>
    </div>
  );
}

function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={
        align === "right"
          ? "pb-2 text-right text-xs font-medium text-muted-foreground"
          : "pb-2 text-left text-xs font-medium text-muted-foreground"
      }
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <td className={align === "right" ? "py-2 text-right align-middle" : "py-2 align-middle"}>
      {children}
    </td>
  );
}
