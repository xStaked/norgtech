import { sanitizeNextPath } from "@/lib/auth";
import { SessionRefresh } from "./session-refresh";

// Vive fuera de `(app)`: no monta el AppShell, asi que no vuelve a llamar a la
// API con el token vencido que la trajo hasta aca.
export default async function SessionRefreshPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <SessionRefresh next={sanitizeNextPath(next)} />;
}
