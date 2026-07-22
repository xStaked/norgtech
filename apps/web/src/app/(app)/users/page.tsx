import { redirect } from "next/navigation";
import { UserManagementClient } from "@/components/users/user-management-client";
import { type ManagedUser, type SellerGoalProgress } from "@/components/users/types";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== "administrador") {
    redirect("/dashboard");
  }

  const errorState = (
    <UserManagementClient users={[]} goalProgress={[]} currentUserId={currentUser.id} loadError />
  );

  let response: Response;
  let goalsResponse: Response | null = null;

  try {
    // El avance de metas alimenta una columna informativa: va en paralelo y su
    // fallo no debe tumbar el listado.
    [response, goalsResponse] = await Promise.all([
      apiFetch("/users?includeInactive=true"),
      apiFetch("/dashboard/seller-goals").catch(() => null),
    ]);
  } catch {
    return errorState;
  }

  if (response.status === 401 || response.status === 403) {
    redirect("/dashboard");
  }

  if (!response.ok) {
    return errorState;
  }

  const users: ManagedUser[] = await response.json();

  let goalProgress: SellerGoalProgress[] = [];
  if (goalsResponse?.ok) {
    const dashboard = (await goalsResponse.json()) as { items?: SellerGoalProgress[] };
    goalProgress = dashboard.items ?? [];
  }

  return (
    <UserManagementClient
      users={users}
      goalProgress={goalProgress}
      currentUserId={currentUser.id}
    />
  );
}
