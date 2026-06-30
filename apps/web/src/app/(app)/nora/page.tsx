import { redirect } from "next/navigation";
import { NoraChat } from "@/components/nora/nora-chat";
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
    <div className="h-full min-h-0">
      <NoraChat initialContext={initialContext} />
    </div>
  );
}
