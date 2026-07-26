"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  Ellipsis,
  Info,
  KeyRound,
  Lock,
  Plus,
  Search,
  Target,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { apiFetchClient } from "@/lib/api.client";
import { type UserRole, USER_ROLES, ROLE_LABELS } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { NewUserDialog } from "@/components/users/new-user-dialog";
import { SellerGoalsDrawer } from "@/components/users/seller-goals-drawer";
import { type ManagedUser, type SellerGoalProgress } from "@/components/users/types";
import {
  ROLE_COLORS,
  avatarColor,
  formatCopCompact,
  goalBarColor,
  initials,
} from "@/components/users/user-format";
import {
  E164_PHONE_PATTERN,
  PHONE_VALIDATION_MESSAGE,
  normalizePhoneInput,
  readErrorMessage,
} from "@/components/users/user-mutations";

interface UserManagementClientProps {
  users: ManagedUser[];
  goalProgress: SellerGoalProgress[];
  currentUserId: string;
  /** El API no respondio: se muestra el estado de error en vez de la tabla. */
  loadError?: boolean;
}

/** Roles a los que se les puede fijar una meta (espejo de SELLER_ROLES del API). */
const SELLER_ROLES = new Set<UserRole>(["comercial", "director_comercial"]);

/** Segundos que la contrasena temporal permanece visible tras crear el usuario. */
const TEMP_PASSWORD_TTL_SECONDS = 60;

type StatusTab = "todos" | "activos" | "inactivos";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(date);
}

function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function UserManagementClient({
  users: initialUsers,
  goalProgress,
  currentUserId,
  loadError = false,
}: UserManagementClientProps) {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [tab, setTab] = useState<StatusTab>("todos");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [goalsUser, setGoalsUser] = useState<ManagedUser | null>(null);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pendingUserIds, setPendingUserIds] = useState<Record<string, true>>({});

  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TEMP_PASSWORD_TTL_SECONDS);

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  // La contrasena temporal solo se muestra una vez: se descarta sola para que
  // no quede en pantalla en un equipo compartido.
  useEffect(() => {
    if (!tempPassword) return;

    setSecondsLeft(TEMP_PASSWORD_TTL_SECONDS);
    const intervalId = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          setTempPassword(null);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [tempPassword]);

  const progressByUser = useMemo(() => {
    const map = new Map<string, SellerGoalProgress>();
    for (const item of goalProgress) map.set(item.userId, item);
    return map;
  }, [goalProgress]);

  const counts = useMemo(
    () => ({
      todos: users.length,
      activos: users.filter((user) => user.active).length,
      inactivos: users.filter((user) => !user.active).length,
    }),
    [users],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users
      .filter((user) => {
        if (tab === "activos" && !user.active) return false;
        if (tab === "inactivos" && user.active) return false;
        if (roleFilter !== "all" && user.role !== roleFilter) return false;
        if (!term) return true;
        return (
          user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name, "es"));
  }, [users, tab, roleFilter, search]);

  function isPending(userId: string) {
    return !!pendingUserIds[userId];
  }

  function markPending(userId: string, pending: boolean) {
    setPendingUserIds((current) => {
      const next = { ...current };
      if (pending) next[userId] = true;
      else delete next[userId];
      return next;
    });
  }

  function startEdit(user: ManagedUser) {
    setEditingUserId(user.id);
    setDraftName(user.name);
    setDraftPhone(user.phone ?? "");
    setPhoneError(null);
  }

  function cancelEdit() {
    setEditingUserId(null);
    setPhoneError(null);
  }

  async function patchUser(
    user: ManagedUser,
    body: Partial<Pick<ManagedUser, "name" | "phone" | "role" | "active">>,
    successMessage: string,
  ) {
    if (isPending(user.id)) return null;

    markPending(user.id, true);

    try {
      const response = await apiFetchClient(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        toast.error("No se pudo guardar el cambio", {
          description: await readErrorMessage(response, "Intenta de nuevo en unos segundos."),
        });
        return null;
      }

      const updatedUser = (await response.json()) as ManagedUser;
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? updatedUser : item)),
      );
      toast.success("Cambios guardados", { description: successMessage });
      router.refresh();
      return updatedUser;
    } catch {
      toast.error("Error de conexión", {
        description: "No se pudo contactar al servidor.",
      });
      return null;
    } finally {
      markPending(user.id, false);
    }
  }

  async function handleNameBlur(user: ManagedUser) {
    const trimmedName = draftName.trim();

    if (!trimmedName || trimmedName === user.name) {
      setDraftName(user.name);
      return;
    }

    const updated = await patchUser(user, { name: trimmedName }, `Nombre actualizado a ${trimmedName}.`);
    if (!updated) setDraftName(user.name);
  }

  async function handlePhoneBlur(user: ManagedUser) {
    const normalizedPhone = normalizePhoneInput(draftPhone);

    if (normalizedPhone === (user.phone ?? "")) {
      setPhoneError(null);
      setDraftPhone(user.phone ?? "");
      return;
    }

    if (!E164_PHONE_PATTERN.test(normalizedPhone)) {
      setPhoneError(PHONE_VALIDATION_MESSAGE);
      return;
    }

    const updated = await patchUser(
      user,
      { phone: normalizedPhone },
      `Teléfono de ${user.name} actualizado.`,
    );
    if (updated) {
      setPhoneError(null);
      setDraftPhone(updated.phone ?? "");
    } else {
      setDraftPhone(user.phone ?? "");
    }
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Contraseña copiada");
    } catch {
      toast.error("No se pudo copiar", { description: "Selecciónala y cópiala a mano." });
    }
  }

  const columns: readonly DataTableColumn<ManagedUser>[] = [
    {
      key: "user",
      header: "Usuario",
      render: (user) => {
        const editing = editingUserId === user.id;

        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
              style={{ background: avatarColor(user.id) }}
            >
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              {editing ? (
                <Input
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={() => void handleNameBlur(user)}
                  disabled={isPending(user.id)}
                  aria-label={`Nombre de ${user.email}`}
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-bold">{user.name}</span>
                  {user.id === currentUserId ? (
                    <span className="shrink-0 rounded-[5px] bg-[#e6f0f6] px-1.5 py-px text-[10px] font-bold text-[#0f5c8a]">
                      Tu usuario
                    </span>
                  ) : null}
                </div>
              )}
              {isPending(user.id) ? (
                <div className="mt-px text-[10.5px] font-semibold text-[#0288c4]">Guardando…</div>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      key: "email",
      header: "Email",
      render: (user) => (
        <span className="block truncate font-mono text-[11.5px] text-[#3a4658]">{user.email}</span>
      ),
    },
    {
      key: "phone",
      header: "Teléfono",
      width: "170px",
      render: (user) => {
        if (editingUserId !== user.id) {
          return user.phone ? (
            <span className="tabular-nums text-[#3a4658]">{user.phone}</span>
          ) : (
            <span className="text-[#c2cbd6]">—</span>
          );
        }

        return (
          <div className="min-w-0">
            <Input
              type="tel"
              className={cn("tabular-nums", phoneError && "border-[#ee1c25] border-[1.5px]")}
              value={draftPhone}
              onChange={(event) => {
                setPhoneError(null);
                setDraftPhone(event.target.value);
              }}
              onBlur={() => void handlePhoneBlur(user)}
              disabled={isPending(user.id)}
              placeholder="+573001234567"
              title={PHONE_VALIDATION_MESSAGE}
              aria-label={`Teléfono de ${user.email}`}
            />
            {phoneError ? (
              <div className="mt-0.5 text-[10px] font-semibold text-[#b42318]">
                Formato internacional: +57…
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "role",
      header: "Rol",
      width: "185px",
      render: (user) => {
        if (user.id === currentUserId) {
          return (
            <span
              title="No puedes cambiar tu propio rol"
              className="inline-flex h-[30px] cursor-not-allowed items-center gap-1.5 rounded-[7px] border border-[#eef1f6] px-2.5 text-xs font-semibold text-[#9aa3b1]"
            >
              {ROLE_LABELS[user.role] ?? user.role}
              <Lock className="h-3 w-3" />
            </span>
          );
        }

        return (
          <Select
            value={user.role}
            onValueChange={(value) => {
              const nextRole = value as UserRole | "";
              if (!nextRole || nextRole === user.role) return;
              void patchUser(
                user,
                { role: nextRole },
                `El rol de ${user.name} se actualizó a ${ROLE_LABELS[nextRole] ?? nextRole}.`,
              );
            }}
            disabled={isPending(user.id)}
            className="h-[30px] text-xs"
            aria-label={`Rol de ${user.email}`}
            options={USER_ROLES.map((option) => ({
              value: option,
              label: ROLE_LABELS[option] ?? option,
              dot: ROLE_COLORS[option],
            }))}
          />
        );
      },
    },
    {
      key: "goal",
      header: "Meta del periodo",
      width: "160px",
      render: (user) => {
        const progress = progressByUser.get(user.id);

        if (!progress) return <span className="text-[#c2cbd6]">—</span>;

        return (
          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold tabular-nums text-[#3a4658]">
                {Math.round(progress.percentage)}%
              </span>
              <span className="text-[10.5px] tabular-nums text-muted-foreground">
                {formatCopCompact(progress.soldAmount)} / {formatCopCompact(progress.targetAmount)}
              </span>
            </div>
            <div className="h-[5px] overflow-hidden rounded-full bg-[#eef1f6]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, progress.percentage)}%`,
                  background: goalBarColor(progress.percentage),
                }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Estado",
      width: "125px",
      render: (user) => {
        const locked = user.id === currentUserId;

        return (
          <button
            type="button"
            role="switch"
            aria-checked={user.active}
            aria-label={`Estado de ${user.email}`}
            title={locked ? "No puedes desactivar tu propia cuenta" : undefined}
            disabled={locked || isPending(user.id)}
            onClick={() =>
              void patchUser(
                user,
                { active: !user.active },
                `${user.name} quedó ${user.active ? "inactivo" : "activo"}.`,
              )
            }
            className="flex items-center gap-2 disabled:cursor-not-allowed"
          >
            <span
              aria-hidden
              className={cn(
                "relative inline-block h-[18px] w-8 shrink-0 rounded-full transition-colors",
                locked ? "bg-[#a8c5d8]" : user.active ? "bg-[#00a651]" : "bg-[#c2cbd6]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all",
                  user.active ? "right-0.5" : "left-0.5",
                )}
              />
            </span>
            <span
              className={cn(
                "text-xs font-semibold",
                user.active ? "text-[#167c4a]" : "text-[#7a8696]",
              )}
            >
              {user.active ? "Activo" : "Inactivo"}
            </span>
          </button>
        );
      },
    },
    {
      key: "updated",
      header: "Actualizado",
      width: "110px",
      render: (user) => (
        <span className="tabular-nums text-muted-foreground">{formatDate(user.updatedAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      align: "right",
      render: (user) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Acciones de ${user.email}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#aab4c2] transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Ellipsis className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {editingUserId === user.id ? (
              <DropdownMenuItem onClick={cancelEdit}>Terminar edición</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => startEdit(user)}>
                Editar nombre y teléfono
              </DropdownMenuItem>
            )}
            {SELLER_ROLES.has(user.role) ? (
              <DropdownMenuItem onClick={() => setGoalsUser(user)}>
                <Target />
                Metas de venta
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              variant={user.active ? "destructive" : "default"}
              disabled={user.id === currentUserId}
              onClick={() =>
                void patchUser(
                  user,
                  { active: !user.active },
                  `${user.name} quedó ${user.active ? "inactivo" : "activo"}.`,
                )
              }
            >
              {user.active ? "Desactivar acceso" : "Activar acceso"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const statusTabs: Array<{ key: StatusTab; label: string; count: number; tone: string }> = [
    { key: "todos", label: "Todos", count: counts.todos, tone: "bg-[#e6f0f6] text-[#0f5c8a]" },
    { key: "activos", label: "Activos", count: counts.activos, tone: "bg-[#e6f4ec] text-[#167c4a]" },
    {
      key: "inactivos",
      label: "Inactivos",
      count: counts.inactivos,
      tone: "bg-[#eef1f5] text-[#7a8696]",
    },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Administración"
        title="Usuarios"
        description="Administra altas, roles y estado de acceso del CRM."
        actions={
          <Button size="lg" onClick={() => setCreateOpen(true)}>
            <Plus />
            Nuevo usuario
          </Button>
        }
      />

      {tempPassword ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#bcdcf0] bg-[#e4f1f9] px-4 py-3">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[#0288c4] text-white">
            <KeyRound className="h-[17px] w-[17px]" />
          </span>
          <div className="min-w-[220px] flex-1">
            <div className="text-[13px] font-bold text-foreground">
              Usuario creado: {tempPassword.name} · contraseña temporal generada
            </div>
            <div className="mt-px text-xs text-[#3f6a86]">
              Cópiala ahora — solo se muestra una vez y desaparece en{" "}
              <b>{formatCountdown(secondsLeft)}</b>.
            </div>
          </div>
          <div className="flex h-[38px] items-center gap-2 rounded-lg border border-[#bcdcf0] bg-card pl-3.5 pr-1.5">
            <span className="font-mono text-[13.5px] font-semibold tracking-wide text-foreground">
              {tempPassword.password}
            </span>
            <Button size="sm" onClick={() => void copyPassword(tempPassword.password)}>
              <Copy />
              Copiar
            </Button>
          </div>
          <button
            type="button"
            className="text-[#6f93ab]"
            aria-label="Ocultar contraseña temporal"
            onClick={() => setTempPassword(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-border bg-card px-8 py-11 text-center">
          <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#fcebe9]">
            <TriangleAlert className="h-6 w-6 text-[#b42318]" />
          </div>
          <div className="text-[15px] font-extrabold text-foreground">
            No pudimos cargar los usuarios
          </div>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-muted-foreground">
            Revisa tu conexión e inténtalo de nuevo. Si el problema persiste, contacta a soporte.
          </p>
          <Button variant="outline" size="lg" className="mt-4" onClick={() => router.refresh()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-6 border-b border-border">
            {statusTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 pb-2.5 text-[13px] transition-colors",
                  tab === item.key
                    ? "border-[#0f5c8a] font-bold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                <span className={cn("rounded-full px-1.5 py-px text-[11px] font-bold", item.tone)}>
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-[250px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nombre o email…"
                aria-label="Buscar usuarios"
              />
            </div>
            <Select
              value={roleFilter}
              onValueChange={(value) => setRoleFilter((value as UserRole | "all") || "all")}
              className="w-auto min-w-40"
              aria-label="Filtrar por rol"
              options={[
                { value: "all", label: "Todos los roles" },
                ...USER_ROLES.map((option) => ({
                  value: option,
                  label: ROLE_LABELS[option] ?? option,
                })),
              ]}
            />
            <span className="ml-auto text-xs text-muted-foreground">Ordenado por nombre</span>
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(user) => user.id}
            rowStyle={(user) => (user.active ? undefined : { opacity: 0.72 })}
            footer={
              <>
                Mostrando {rows.length} de {users.length} · La edición se guarda automáticamente al
                salir del campo
              </>
            }
            emptyState={
              <div className="rounded-xl border border-border bg-card px-8 py-11 text-center">
                <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-[14px] bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="text-[15px] font-extrabold text-foreground">
                  {users.length === 0
                    ? "No hay usuarios registrados"
                    : "Ningún usuario coincide con el filtro"}
                </div>
                <p className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-muted-foreground">
                  {users.length === 0
                    ? "Crea el primer usuario del CRM para empezar a asignar roles y metas."
                    : "Ajusta la búsqueda, el rol o la pestaña de estado."}
                </p>
                {users.length === 0 ? (
                  <Button size="lg" className="mt-4" onClick={() => setCreateOpen(true)}>
                    <Plus />
                    Nuevo usuario
                  </Button>
                ) : null}
              </div>
            }
          />

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />
            No puedes cambiar tu propio rol ni desactivar tu propia cuenta. Los usuarios nunca se
            eliminan: se desactivan para conservar su historial.
          </p>
        </>
      )}

      <NewUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(user, temporaryPassword) => {
          setUsers((current) => [...current, user]);
          if (temporaryPassword) {
            setTempPassword({ name: user.name, password: temporaryPassword });
          }
          router.refresh();
        }}
      />

      <SellerGoalsDrawer user={goalsUser} onOpenChange={(open) => !open && setGoalsUser(null)} />
    </div>
  );
}
