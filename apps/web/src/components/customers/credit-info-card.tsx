import { SectionCard } from "@/components/ui/section-card";
import { crmTheme } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";

interface CreditSummary {
  creditLimit: number | null;
  purchaseBudget: number | null;
  currentBalance: number;
  availableCredit: number | null;
  utilizationPercent: number | null;
  isNearLimit: boolean;
  purchaseProgress: {
    currentMonthSales: number;
    budget: number | null;
    percent: number | null;
  };
}

function fmt(value: number): string {
  return `$${value.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function utilizationColor(pct: number | null): string {
  if (pct == null) return "#6b7c93";
  if (pct >= 100) return "#d92d20";
  if (pct >= 80) return "#dc6803";
  return "#17b26a";
}

function BudgetProgressBar({ percent }: { percent: number | null }) {
  const pct = Math.min(percent ?? 0, 100);
  return (
    <div
      style={{
        height: 8,
        borderRadius: 4,
        background: "#eef3f8",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 4,
          background: "#2d6cdf",
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

function CreditProgressBar({ percent, color }: { percent: number | null; color: string }) {
  const pct = Math.min(percent ?? 0, 100);
  return (
    <div
      style={{
        height: 8,
        borderRadius: 4,
        background: "#eef3f8",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 4,
          background: color,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

interface CreditInfoCardProps {
  customerId: string;
}

export async function CreditInfoCard({ customerId }: CreditInfoCardProps) {
  const res = await apiFetch(`/credit/customers/${customerId}/summary`);

  if (!res.ok) {
    return (
      <SectionCard title="Credito y cupo">
        <div style={{ fontSize: "0.9375rem", color: "#6b7c93" }}>
          Sin informacion de credito disponible
        </div>
      </SectionCard>
    );
  }

  const data: CreditSummary = await res.json();

  return (
    <SectionCard
      title="Credito y cupo"
      description={
        data.isNearLimit
          ? "Cliente cerca del limite de credito"
          : "Estado actual de credito y presupuesto"
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        {data.isNearLimit && (
          <div
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "#fef3c7",
              color: "#92400e",
              fontSize: "0.875rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>&#9888;</span>
            Cerca del limite de credito ({data.utilizationPercent?.toFixed(0)}% usado)
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <CreditKpi
            label="Limite de credito"
            value={data.creditLimit != null ? fmt(data.creditLimit) : "Sin limite"}
          />
          <CreditKpi
            label="Saldo pendiente"
            value={fmt(data.currentBalance)}
            color="#d92d20"
          />
          <CreditKpi
            label="Disponible"
            value={data.availableCredit != null ? fmt(data.availableCredit) : "Sin limite"}
            color="#17b26a"
          />
          <CreditKpi
            label="% utilizado"
            value={data.utilizationPercent != null ? `${data.utilizationPercent.toFixed(0)}%` : "\u2014"}
            color={utilizationColor(data.utilizationPercent)}
          />
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.8125rem", color: "#52637a" }}>Uso de credito</span>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: utilizationColor(data.utilizationPercent) }}>
              {data.utilizationPercent != null ? `${data.utilizationPercent.toFixed(0)}%` : "\u2014"}
            </span>
          </div>
          <CreditProgressBar percent={data.utilizationPercent} color={utilizationColor(data.utilizationPercent)} />
        </div>

        {data.purchaseBudget != null && data.purchaseBudget > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: crmTheme.colors.text, marginBottom: 12 }}>
              Presupuesto mensual
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <CreditKpi label="Meta mensual" value={fmt(data.purchaseBudget)} />
              <CreditKpi label="Ventas del mes" value={fmt(data.purchaseProgress.currentMonthSales)} />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.8125rem", color: "#52637a" }}>Progreso</span>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#2d6cdf" }}>
                  {data.purchaseProgress.percent != null ? `${data.purchaseProgress.percent.toFixed(0)}%` : "\u2014"}
                </span>
              </div>
              <BudgetProgressBar percent={data.purchaseProgress.percent} />
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function CreditKpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        border: `1px solid ${crmTheme.colors.border}`,
        background: crmTheme.colors.surfaceMuted,
      }}
    >
      <div style={{ fontSize: "0.75rem", color: "#6b7c93", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: color ?? crmTheme.colors.text }}>
        {value}
      </div>
    </div>
  );
}
