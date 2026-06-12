"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { type UserRole, USER_ROLES } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserManagementClientProps {
  users: ManagedUser[];
  currentUserId: string;
}

interface CreateUserResponse {
  user?: ManagedUser;
  temporaryPassword?: string;
}

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function readErrorMessage(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  return data?.message ?? fallback;
}

export function UserManagementClient({
  users: initialUsers,
  currentUserId,
}: UserManagementClientProps) {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("comercial");
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingUserIds, setPendingUserIds] = useState<string[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  useEffect(() => {
    setDraftNames(
      initialUsers.reduce<Record<string, string>>((acc, user) => {
        acc[user.id] = user.name;
        return acc;
      }, {}),
    );
  }, [initialUsers]);

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => left.name.localeCompare(right.name, "es")),
    [users],
  );

  function markPending(userId: string, pending: boolean) {
    setPendingUserIds((current) => {
      if (pending) {
        return current.includes(userId) ? current : [...current, userId];
      }

      return current.filter((id) => id !== userId);
    });
  }

  function isPending(userId: string) {
    return pendingUserIds.includes(userId);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setTemporaryPassword(null);
    setLoading(true);

    try {
      const response = await apiFetchClient("/users", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, "Error al crear el usuario"));
        setLoading(false);
        return;
      }

      const data = (await response.json()) as CreateUserResponse;

      const createdUser = data.user;

      if (createdUser) {
        setUsers((current) => [...current, createdUser]);
        setDraftNames((current) => ({
          ...current,
          [createdUser.id]: createdUser.name,
        }));
      }

      setTemporaryPassword(data.temporaryPassword ?? null);
      setName("");
      setEmail("");
      setRole("comercial");
      router.refresh();
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  async function patchUser(userId: string, body: Partial<Pick<ManagedUser, "name" | "role" | "active">>) {
    setError(null);
    markPending(userId, true);

    try {
      const response = await apiFetchClient(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, "Error al actualizar el usuario"));
        return null;
      }

      const updatedUser = (await response.json()) as ManagedUser;
      setUsers((current) => current.map((user) => (user.id === userId ? updatedUser : user)));
      setDraftNames((current) => ({
        ...current,
        [userId]: updatedUser.name,
      }));
      return updatedUser;
    } catch {
      setError("Error de conexion");
      return null;
    } finally {
      markPending(userId, false);
    }
  }

  async function handleNameBlur(user: ManagedUser) {
    const draftValue = draftNames[user.id] ?? user.name;
    const trimmedName = draftValue.trim();

    if (!trimmedName) {
      setDraftNames((current) => ({
        ...current,
        [user.id]: user.name,
      }));
      return;
    }

    if (trimmedName === user.name) {
      if (draftValue !== user.name) {
        setDraftNames((current) => ({
          ...current,
          [user.id]: user.name,
        }));
      }
      return;
    }

    const updatedUser = await patchUser(user.id, { name: trimmedName });
    if (!updatedUser) {
      setDraftNames((current) => ({
        ...current,
        [user.id]: user.name,
      }));
    }
  }

  async function handleRoleChange(user: ManagedUser, nextRole: UserRole) {
    if (nextRole === user.role) {
      return;
    }

    const previousRole = user.role;
    setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, role: nextRole } : item)));
    const updatedUser = await patchUser(user.id, { role: nextRole });

    if (!updatedUser) {
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, role: previousRole } : item)),
      );
    }
  }

  async function handleActiveToggle(user: ManagedUser, nextActive: boolean) {
    if (nextActive === user.active) {
      return;
    }

    const previousActive = user.active;
    setUsers((current) =>
      current.map((item) => (item.id === user.id ? { ...item, active: nextActive } : item)),
    );
    const updatedUser = await patchUser(user.id, { active: nextActive });

    if (!updatedUser) {
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, active: previousActive } : item)),
      );
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
          <CardDescription>
            Crea accesos internos y comparte la contrasena temporal una sola vez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="grid gap-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {temporaryPassword ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm font-medium text-foreground">Contrasena temporal</p>
                <p className="mt-1 font-mono text-sm text-foreground">{temporaryPassword}</p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-1">
                <Label htmlFor="user-name">Nombre</Label>
                <Input
                  id="user-name"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="user-role">Rol</Label>
                <select
                  id="user-role"
                  name="role"
                  className={selectClasses}
                  value={role}
                  onChange={(event) => setRole(event.target.value as UserRole)}
                  required
                >
                  {USER_ROLES.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {roleOption}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Button type="submit" disabled={loading}>
                {loading ? "Guardando..." : "Crear usuario"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios activos</CardTitle>
          <CardDescription>
            Edita nombre, rol y estado sin salir de esta vista.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay usuarios registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Actualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.map((user) => {
                  const lockedCurrentUser = user.id === currentUserId;
                  const pending = isPending(user.id);

                  return (
                    <TableRow key={user.id}>
                      <TableCell className="align-top">
                        <div className="grid gap-1">
                          <Input
                            value={draftNames[user.id] ?? user.name}
                            onChange={(event) =>
                              setDraftNames((current) => ({
                                ...current,
                                [user.id]: event.target.value,
                              }))
                            }
                            onBlur={() => void handleNameBlur(user)}
                            disabled={pending}
                            aria-label={`Nombre de ${user.email}`}
                          />
                          {lockedCurrentUser ? (
                            <p className="text-xs text-muted-foreground">
                              No puedes quitar tu propio acceso de administrador desde aqui.
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="grid gap-1">
                          <span className="text-sm text-foreground">{user.email}</span>
                          {lockedCurrentUser ? (
                            <Badge variant="secondary">Tu usuario</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <select
                          className={selectClasses}
                          value={user.role}
                          onChange={(event) => void handleRoleChange(user, event.target.value as UserRole)}
                          disabled={lockedCurrentUser || pending}
                          aria-label={`Rol de ${user.email}`}
                        >
                          {USER_ROLES.map((roleOption) => (
                            <option key={roleOption} value={roleOption}>
                              {roleOption}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="grid gap-2">
                          <label className="inline-flex items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={user.active}
                              onChange={(event) => void handleActiveToggle(user, event.target.checked)}
                              disabled={lockedCurrentUser || pending}
                              className="h-4 w-4 rounded border-input"
                            />
                            <span>{user.active ? "Activo" : "Inactivo"}</span>
                          </label>
                          <Badge variant={user.active ? "secondary" : "outline"}>
                            {user.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {formatDate(user.updatedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
