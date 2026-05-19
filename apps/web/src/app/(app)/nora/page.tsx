import { redirect } from "next/navigation";
import { NoraChat } from "@/components/nora/nora-chat";
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

  if (!canAccess(role, "/nora")) {
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
          contextLabel:
            typeof contextLabelRaw === "string" ? contextLabelRaw : null,
        }
      : null;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="mx-auto w-full max-w-3xl shrink-0">
        <PageHeader
          eyebrow="Asistente comercial"
          title="Nora"
          description="Conversá en lenguaje natural y Nora arma los registros por vos."
        />
      </div>

      <div className="min-h-0 flex-1">
        <NoraChat initialContext={initialContext} />
      </div>

      <style>{`
        @keyframes noraBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes noraPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
