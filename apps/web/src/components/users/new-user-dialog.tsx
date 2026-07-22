"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Plus } from "lucide-react";
import { apiFetchClient } from "@/lib/api.client";
import { type UserRole, USER_ROLES, ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ManagedUser } from "@/components/users/types";
import {
  E164_PHONE_PATTERN,
  PHONE_VALIDATION_MESSAGE,
  normalizePhoneInput,
  readErrorMessage,
} from "@/components/users/user-mutations";

interface NewUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: ManagedUser, temporaryPassword: string | null) => void;
}

interface CreateUserResponse {
  user?: ManagedUser;
  temporaryPassword?: string;
}

export function NewUserDialog({ open, onOpenChange, onCreated }: NewUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("comercial");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setRole("comercial");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedPhone = normalizePhoneInput(phone);

    if (!E164_PHONE_PATTERN.test(normalizedPhone)) {
      setError(PHONE_VALIDATION_MESSAGE);
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
        return;
      }

      const data = (await response.json()) as CreateUserResponse;

      if (data.user) {
        onCreated(data.user, data.temporaryPassword ?? null);
      }

      reset();
      onOpenChange(false);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
        <div className="h-[3px] bg-[linear-gradient(90deg,#00a651,#a7ce39,#0288c4,#ffcb06,#f58221,#ee1c25)]" />

        <DialogHeader className="px-6 pt-5">
          <DialogTitle className="text-[18px] font-extrabold text-foreground">
            Nuevo usuario
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Se generará una contraseña temporal que se muestra una sola vez.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6">
          {error ? (
            <p className="mb-4 rounded-lg border border-[#f5c9c4] bg-[#fcebe9] px-3 py-2 text-[12.5px] font-semibold text-[#b42318]">
              {error}
            </p>
          ) : null}

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="new-user-name" className="text-xs font-semibold text-[#3a4658]">
                Nombre completo <span className="text-[#b42318]">*</span>
              </Label>
              <Input
                id="new-user-name"
                className="h-10"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="new-user-role" className="text-xs font-semibold text-[#3a4658]">
                Rol <span className="text-[#b42318]">*</span>
              </Label>
              <Select value={role} onValueChange={(value) => setRole((value as UserRole) ?? "comercial")}>
                <SelectTrigger id="new-user-role" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ROLE_LABELS[option] ?? option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="new-user-email" className="text-xs font-semibold text-[#3a4658]">
                Email <span className="text-[#b42318]">*</span>
              </Label>
              <Input
                id="new-user-email"
                className="h-10"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <p className="text-[10.5px] text-muted-foreground">
                Único. No se puede cambiar después de crear.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="new-user-phone" className="text-xs font-semibold text-[#3a4658]">
                Teléfono <span className="text-[#b42318]">*</span>
              </Label>
              <Input
                id="new-user-phone"
                className="h-10 tabular-nums"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+573001234567"
                title={PHONE_VALIDATION_MESSAGE}
                required
              />
              <p className="text-[10.5px] text-muted-foreground">
                Formato internacional. Se usa para WhatsApp y Nora.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-[9px] border border-[#bcdcf0] bg-[#e4f1f9] px-3.5 py-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0288c4] text-white">
              <KeyRound className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs leading-relaxed text-[#3f6a86]">
              Al crear, el sistema genera una contraseña temporal tipo{" "}
              <b className="font-mono">Nt-xxxxxxxxxxxx</b>. El usuario deberá cambiarla en su primer
              ingreso.
            </span>
          </div>

          <div className="mt-5 flex justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={loading}>
              <Plus />
              {loading ? "Creando…" : "Crear usuario"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
