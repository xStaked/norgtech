import { redirect } from "next/navigation";
import { UserManagementClient } from "@/components/users/user-management-client";
import { type ManagedUser } from "@/components/users/types";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";

function UsersPageErrorState() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Administra altas, roles y estado de acceso del CRM.
        </p>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudo cargar la administracion de usuarios. Intenta de nuevo en unos minutos.
      </div>
    </div>
  );
}

export default async function UsersPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== "administrador") {
    redirect("/dashboard");
  }

  let response: Response;

  try {
    response = await apiFetch("/users");
  } catch {
    return <UsersPageErrorState />;
  }

  if (response.status === 401 || response.status === 403) {
    redirect("/dashboard");
  }

  if (!response.ok) {
    return <UsersPageErrorState />;
  }

  const users: ManagedUser[] = await response.json();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Administra altas, roles y estado de acceso del CRM.
        </p>
      </div>

      <UserManagementClient users={users} currentUserId={currentUser.id} />
    </div>
  );
}
