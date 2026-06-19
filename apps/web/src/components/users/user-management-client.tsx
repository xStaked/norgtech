"use client";

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
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
import { SellerGoalsManager } from "@/components/users/seller-goals-manager";
import { type ManagedUser } from "@/components/users/types";

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
const e164PhonePattern = /^\+[1-9]\d{9,14}$/;
const phoneValidationMessage =
  "El telefono debe tener formato internacional, por ejemplo +573001234567";
const sellerGoalRoles = new Set<UserRole>(["comercial", "director_comercial"]);

function normalizePhoneInput(value: string) {
  return value.trim().replace(/[\s().-]/g, "");
}

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
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("comercial");
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftPhones, setDraftPhones] = useState<Record<string, string>>({});
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(true);
  const [pendingUserIds, setPendingUserIds] = useState<Record<string, true>>({});
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

  useEffect(() => {
    setDraftPhones(
      initialUsers.reduce<Record<string, string>>((acc, user) => {
        acc[user.id] = user.phone ?? "";
        return acc;
      }, {}),
    );
  }, [initialUsers]);

  useEffect(() => {
    if (!temporaryPassword) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTemporaryPassword(null);
    }, 60_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [temporaryPassword]);

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => left.name.localeCompare(right.name, "es")),
    [users],
  );

  function markPending(userId: string, pending: boolean) {
    setPendingUserIds((current) => {
      if (pending) {
        if (current[userId]) {
          return current;
        }

        return {
          ...current,
          [userId]: true,
        };
      }

      if (!current[userId]) {
        return current;
      }

      const next = { ...current };
      delete next[userId];
      return next;
    });
  }

  function isPending(userId: string) {
    return !!pendingUserIds[userId];
  }

  function clearPhoneError(userId: string) {
    setPhoneErrors((current) => {
      if (!current[userId]) {
        return current;
      }

      const next = { ...current };
      delete next[userId];
      return next;
    });
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setTemporaryPassword(null);

    const normalizedPhone = normalizePhoneInput(phone);

    if (!e164PhonePattern.test(normalizedPhone)) {
      setError(phoneValidationMessage);
      setPhone(normalizedPhone);
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetchClient("/users", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: normalizedPhone,
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
        setDraftPhones((current) => ({
          ...current,
          [createdUser.id]: createdUser.phone ?? "",
        }));
      }

      setTemporaryPassword(data.temporaryPassword ?? null);
      setName("");
      setEmail("");
      setPhone("");
      setRole("comercial");
      setShowCreateForm(true);
      router.refresh();
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  async function patchUser(
    userId: string,
    body: Partial<Pick<ManagedUser, "name" | "phone" | "role" | "active">>,
  ) {
    if (isPending(userId)) {
      return null;
    }

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
      setDraftPhones((current) => ({
        ...current,
        [userId]: updatedUser.phone ?? "",
      }));
      router.refresh();
      return updatedUser;
    } catch {
      setError("Error de conexion");
      return null;
    } finally {
      markPending(userId, false);
    }
  }

  async function handleNameBlur(user: ManagedUser) {
    if (isPending(user.id)) {
      return;
    }

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

  async function handlePhoneBlur(user: ManagedUser) {
    if (isPending(user.id)) {
      return;
    }

    const draftValue = draftPhones[user.id] ?? user.phone ?? "";
    const normalizedPhone = normalizePhoneInput(draftValue);

    if (!normalizedPhone) {
      setPhoneErrors((current) => ({
        ...current,
        [user.id]: phoneValidationMessage,
      }));
      setDraftPhones((current) => ({
        ...current,
        [user.id]: user.phone ?? "",
      }));
      return;
    }

    if (normalizedPhone === (user.phone ?? "")) {
      clearPhoneError(user.id);
      if (draftValue !== (user.phone ?? "")) {
        setDraftPhones((current) => ({
          ...current,
          [user.id]: user.phone ?? "",
        }));
      }
      return;
    }

    if (!e164PhonePattern.test(normalizedPhone)) {
      setPhoneErrors((current) => ({
        ...current,
        [user.id]: phoneValidationMessage,
      }));
      setDraftPhones((current) => ({
        ...current,
        [user.id]: user.phone ?? "",
      }));
      return;
    }

    const updatedUser = await patchUser(user.id, { phone: normalizedPhone });
    if (updatedUser) {
      clearPhoneError(user.id);
    }
    if (!updatedUser) {
      setDraftPhones((current) => ({
        ...current,
        [user.id]: user.phone ?? "",
      }));
    }
  }

  async function handleRoleChange(user: ManagedUser, nextRole: UserRole) {
    if (isPending(user.id) || nextRole === user.role) {
      return;
    }

    await patchUser(user.id, { role: nextRole });
  }

  async function handleActiveToggle(user: ManagedUser, nextActive: boolean) {
    if (isPending(user.id) || nextActive === user.active) {
      return;
    }

    await patchUser(user.id, { active: nextActive });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Nuevo usuario</CardTitle>
              <CardDescription>
                Crea accesos internos y comparte la contrasena temporal una sola vez.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateForm((current) => !current)}
            >
              Nuevo usuario
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showCreateForm ? (
            <form onSubmit={handleCreateUser} className="grid gap-4">
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {temporaryPassword ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Contrasena temporal</p>
                      <p className="mt-1 font-mono text-sm text-foreground">{temporaryPassword}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTemporaryPassword(null)}
                    >
                      Listo
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-4">
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
                  <Label htmlFor="user-phone">Telefono</Label>
                  <Input
                    id="user-phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+573001234567"
                    required
                    title="Usa formato internacional, por ejemplo +573001234567"
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
          ) : (
            <p className="text-sm text-muted-foreground">
              Usa el boton Nuevo usuario para abrir el formulario de alta.
            </p>
          )}
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
                  <TableHead>Telefono</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Actualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.map((user) => {
                  const lockedCurrentUser = user.id === currentUserId;
                  const pending = isPending(user.id);
                  const disableRowControls = lockedCurrentUser || pending;
                  const showSellerGoals = sellerGoalRoles.has(user.role);

                  return (
                    <Fragment key={user.id}>
                      <TableRow>
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
                            {pending ? (
                              <p className="text-xs text-muted-foreground">
                                Guardando cambios...
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
                          <div className="grid gap-1">
                            <Input
                              type="tel"
                              value={draftPhones[user.id] ?? user.phone ?? ""}
                              onChange={(event) => {
                                clearPhoneError(user.id);
                                setDraftPhones((current) => ({
                                  ...current,
                                  [user.id]: event.target.value,
                                }));
                              }}
                              onBlur={() => void handlePhoneBlur(user)}
                              disabled={pending}
                              placeholder="+573001234567"
                              title="Usa formato internacional, por ejemplo +573001234567"
                              aria-label={`Telefono de ${user.email}`}
                            />
                            {phoneErrors[user.id] ? (
                              <p className="text-xs text-destructive">{phoneErrors[user.id]}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <select
                            className={selectClasses}
                            value={user.role}
                            onChange={(event) => void handleRoleChange(user, event.target.value as UserRole)}
                            disabled={disableRowControls}
                            aria-label={`Rol de ${user.email}`}
                          >
                            {USER_ROLES.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {roleOption}
                              </option>
                            ))}
                          </select>
                          {lockedCurrentUser ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              No puedes quitar tu propio acceso de administrador desde aqui.
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="grid gap-2">
                            <label className="inline-flex items-center gap-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={user.active}
                                onChange={(event) => void handleActiveToggle(user, event.target.checked)}
                                disabled={disableRowControls}
                                className="h-4 w-4 rounded border-input"
                              />
                              <span>{user.active ? "Activo" : "Inactivo"}</span>
                            </label>
                            {lockedCurrentUser ? (
                              <p className="text-xs text-muted-foreground">
                                No puedes quitar tu propio acceso de administrador desde aqui.
                              </p>
                            ) : null}
                            <Badge variant={user.active ? "secondary" : "outline"}>
                              {user.active ? "Activo" : "Inactivo"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {formatDate(user.updatedAt)}
                        </TableCell>
                      </TableRow>
                      {showSellerGoals ? (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/10">
                            <SellerGoalsManager userId={user.id} canManage />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
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
