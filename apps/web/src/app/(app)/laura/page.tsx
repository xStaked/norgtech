import { redirect } from "next/navigation";
import { LauraChat } from "@/components/laura/laura-chat";
import { InlineMetric } from "@/components/ui/inline-metric";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { canAccess } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth.server";

export default async function LauraPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const role = user?.role ?? null;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!canAccess(role, "/laura")) {
    redirect("/dashboard");
  }

  const contextTypeRaw = resolvedSearchParams?.contextType;
  const contextEntityIdRaw = resolvedSearchParams?.contextEntityId;
  const contextLabelRaw = resolvedSearchParams?.contextLabel;

  const initialContext: {
    contextType: "customer" | "opportunity";
    contextEntityId: string;
    contextLabel: string | null;
  } | null =
    typeof contextTypeRaw === "string" &&
    (contextTypeRaw === "customer" || contextTypeRaw === "opportunity") &&
    typeof contextEntityIdRaw === "string" &&
    contextEntityIdRaw.trim().length > 0
      ? {
          contextType: contextTypeRaw,
          contextEntityId: contextEntityIdRaw,
          contextLabel: typeof contextLabelRaw === "string" ? contextLabelRaw : null,
        }
      : null;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Asistente comercial"
        title="Laura"
        description="Convierte reportes libres en bloques compactos para confirmar sin salir del shell operativo del CRM."
        actions={
          <>
            <InlineMetric label="Modo" value="Conversacional" tone="info" />
            <InlineMetric label="Persistencia V1" value="Sesión en memoria" tone="warning" />
          </>
        }
      />

      <SectionCard
        title="Cómo usarla"
        description="Laura está enfocada en capturar interacciones, actualizar oportunidades y proponer seguimientos editables."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <Tip
            title="1. Reporta libremente"
            body="Escribe como hablarías con un coordinador comercial: cliente, avance, compromiso y siguiente paso."
          />
          <Tip
            title="2. Edita el borrador"
            body="Activa o apaga bloques, corrige títulos y deja clara la persistencia antes de confirmar."
          />
          <Tip
            title="3. Confirma"
            body="Laura envía la versión final al backend usando el contrato de propuestas confirmado."
          />
        </div>
      </SectionCard>

      <LauraChat initialContext={initialContext} />
    </div>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        padding: "16px 18px",
        borderRadius: 16,
        background: "#f7faff",
        border: "1px solid #dbe4ef",
      }}
    >
      <strong style={{ fontSize: 15 }}>{title}</strong>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#52637a" }}>{body}</p>
    </div>
  );
}
