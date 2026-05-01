import { redirect } from "next/navigation";
import { LauraChat } from "@/components/laura/laura-chat";
import { PageHeader } from "@/components/ui/page-header";
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
    <div style={{ display: "grid", gap: 24, maxWidth: 680, margin: "0 auto", width: "100%" }}>
      <PageHeader
        eyebrow="Asistente comercial"
        title="Laura"
        description="Conversá en lenguaje natural y Laura arma los registros por vos."
      />

      <LauraChat initialContext={initialContext} />

      <style>{`
        @keyframes lauraBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes lauraPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
