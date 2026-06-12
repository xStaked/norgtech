import { redirect } from "next/navigation";
import { UserManagementClient, type ManagedUser } from "@/components/users/user-management-client";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== "administrador") {
    redirect("/dashboard");
  }

  const response = await apiFetch("/users");
  const users: ManagedUser[] = response.ok ? await response.json() : [];

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
