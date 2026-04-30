import { SectionCard } from "@/components/ui/section-card";
import { crmTheme } from "@/components/ui/theme";

interface ReportPayload {
  diagnostico: {
    customerName: string;
    visitDate: string;
    summary: string;
    notes: string | null;
  };
  problemas: {
    identified: string[];
  };
  solucion: {
    description: string;
    nextSteps: string | null;
  };
  costos: {
    productCost: number;
    installationCost: number;
    maintenanceAnnual: number;
    firstYearTotal: number;
    breakdown: Array<{ label: string; value: number }>;
  } | null;
  roi: {
    roi: number;
    roiPercentage: number;
    paybackPeriod: number;
    annualSavings: number;
    totalAnnualBenefit: number;
    investment: number;
  } | null;
  cotizacion: {
    quoteId: string | null;
    items: Array<{
      name: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    subtotal: number;
    total: number;
  } | null;
}

interface ReportPayloadViewerProps {
  payload: ReportPayload;
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function ReportPayloadViewer({ payload }: ReportPayloadViewerProps) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <SectionCard title="1. Diagnóstico" description="Contexto de la visita y hallazgos principales.">
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>Cliente</span>
            <div style={{ marginTop: 4, fontSize: 15, color: crmTheme.colors.text }}>{payload.diagnostico.customerName}</div>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>Fecha de visita</span>
            <div style={{ marginTop: 4, fontSize: 15, color: crmTheme.colors.text }}>
              {new Date(payload.diagnostico.visitDate).toLocaleDateString("es-CO")}
            </div>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>Resumen</span>
            <div style={{ marginTop: 4, fontSize: 15, color: crmTheme.colors.text }}>{payload.diagnostico.summary}</div>
          </div>
          {payload.diagnostico.notes ? (
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>Notas</span>
              <div style={{ marginTop: 4, fontSize: 15, color: crmTheme.colors.text }}>{payload.diagnostico.notes}</div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="2. Problemas identificados" description="Necesidades y problemáticas detectadas durante la visita.">
        {payload.problemas.identified.length ? (
          <ul style={{ margin: 0, paddingLeft: 20, color: crmTheme.colors.text, lineHeight: 1.7 }}>
            {payload.problemas.identified.map((problem, i) => (
              <li key={i}>{problem}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, color: crmTheme.colors.textMuted }}>No se identificaron problemas específicos.</p>
        )}
      </SectionCard>

      <SectionCard title="3. Solución propuesta" description="Propuesta de valor y siguientes pasos acordados.">
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>Descripción</span>
            <div style={{ marginTop: 4, fontSize: 15, color: crmTheme.colors.text }}>{payload.solucion.description}</div>
          </div>
          {payload.solucion.nextSteps ? (
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>Siguientes pasos</span>
              <div style={{ marginTop: 4, fontSize: 15, color: crmTheme.colors.text }}>{payload.solucion.nextSteps}</div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      {payload.costos ? (
        <SectionCard title="4. Costos" description="Desglose de inversión requerida.">
          <div style={{ display: "grid", gap: 10 }}>
            {payload.costos.breakdown.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: crmTheme.radius.md,
                  background: crmTheme.colors.surfaceMuted,
                }}
              >
                <span style={{ fontSize: 14, color: crmTheme.colors.text }}>{item.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: crmTheme.colors.text }}>
                  {currencyFormatter.format(item.value)}
                </span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: crmTheme.radius.md,
                background: crmTheme.colors.primarySoft,
                fontWeight: 700,
              }}
            >
              <span style={{ color: crmTheme.colors.text }}>Total primer año</span>
              <span style={{ color: crmTheme.colors.primary }}>{currencyFormatter.format(payload.costos.firstYearTotal)}</span>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {payload.roi ? (
        <SectionCard title="5. ROI" description="Retorno de inversión estimado.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <MetricBox label="Inversión" value={currencyFormatter.format(payload.roi.investment)} />
            <MetricBox label="Ahorro anual" value={currencyFormatter.format(payload.roi.annualSavings)} />
            <MetricBox label="Beneficio total anual" value={currencyFormatter.format(payload.roi.totalAnnualBenefit)} />
            <MetricBox label="ROI" value={`${payload.roi.roiPercentage}%`} tone="success" />
            <MetricBox label="Recuperación" value={`${payload.roi.paybackPeriod} años`} tone="info" />
          </div>
        </SectionCard>
      ) : null}

      {payload.cotizacion ? (
        <SectionCard title="6. Cotización" description="Detalle de la propuesta comercial vinculada.">
          <div style={{ display: "grid", gap: 10 }}>
            {payload.cotizacion.items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: crmTheme.radius.md,
                  background: crmTheme.colors.surfaceMuted,
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: crmTheme.colors.text }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: crmTheme.colors.textSubtle }}>
                    SKU: {item.sku} · {item.quantity} unidad(es) a {currencyFormatter.format(item.unitPrice)}
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: crmTheme.colors.text }}>
                  {currencyFormatter.format(item.subtotal)}
                </span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: crmTheme.radius.md,
                background: crmTheme.colors.primarySoft,
                fontWeight: 700,
              }}
            >
              <span style={{ color: crmTheme.colors.text }}>Total</span>
              <span style={{ color: crmTheme.colors.primary }}>{currencyFormatter.format(payload.cotizacion.total)}</span>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function MetricBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "info" | "warning" | "danger";
}) {
  const toneColor =
    tone === "success"
      ? crmTheme.colors.success
      : tone === "info"
        ? crmTheme.colors.info
        : tone === "warning"
          ? crmTheme.colors.warning
          : tone === "danger"
            ? crmTheme.colors.danger
            : crmTheme.colors.text;

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: crmTheme.radius.md,
        background: crmTheme.colors.surfaceMuted,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: toneColor }}>{value}</div>
    </div>
  );
}
