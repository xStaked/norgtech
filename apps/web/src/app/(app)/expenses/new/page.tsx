import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { apiFetch } from "@/lib/api.server";

interface Customer {
  id: string;
  displayName: string;
}

interface Visit {
  id: string;
  summary: string;
  scheduledAt: string;
  customerId: string | null;
}

export default async function NewExpensePage() {
  const [customersRes, visitsRes] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/visits"),
  ]);

  const customers: Customer[] = customersRes.ok ? await customersRes.json() : [];
  const visits: Visit[] = visitsRes.ok ? await visitsRes.json() : [];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Gastos comerciales"
        title="Nuevo gasto"
        description="Registra una salida de campo con soporte obligatorio para revision contable."
        actions={
          <ButtonLink href="/expenses" variant="secondary">
            Volver a gastos
          </ButtonLink>
        }
      />

      <SectionCard
        title="Detalle del gasto"
        description="Carga la fecha, categoria, monto, contexto comercial y soporte."
      >
        <ExpenseForm customers={customers} visits={visits} />
      </SectionCard>
    </div>
  );
}
