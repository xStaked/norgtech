"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { apiFetchClient } from "@/lib/api.client";

const MIN_LENGTH = 8;

function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const password = String(new FormData(event.currentTarget).get("password"));

    try {
      const response = await apiFetchClient("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(
          typeof data?.message === "string"
            ? data.message
            : "El enlace es inválido o ya expiró",
        );
        return;
      }
      setDone(true);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell
        headline={
          <>
            Listo.
            <br />
            Ya puedes entrar.
          </>
        }
        blurb="Cerramos las sesiones abiertas en otros dispositivos por seguridad."
        glow="success"
      >
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-[60px] items-center justify-center rounded-full bg-[#e6f4ec]">
            <CheckCircle2 className="size-[30px] text-[#167c4a]" strokeWidth={1.6} />
          </div>
          <h1 className="text-[25px] font-extrabold tracking-[-0.02em] text-[#0c2c44]">
            Contraseña actualizada
          </h1>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground">
            Tu nueva contraseña ya está activa. Inicia sesión para continuar.
          </p>
          <Link
            href="/login"
            className="mt-6 flex h-[46px] w-full items-center justify-center rounded-[10px] bg-primary text-[14.5px] font-bold text-primary-foreground shadow-[0_8px_20px_rgba(15,92,138,.25)]"
          >
            Iniciar sesión
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headline={
        <>
          Crea una
          <br />
          contraseña nueva.
        </>
      }
      blurb="Elige una que no uses en otros servicios. Al guardarla cerraremos las sesiones abiertas."
    >
      <div className="mb-[18px] flex size-12 items-center justify-center rounded-xl bg-[#e4f1f9]">
        <KeyRound className="size-5 text-[#0288c4]" />
      </div>
      <h1 className="text-[25px] font-extrabold tracking-[-0.02em] text-[#0c2c44]">
        Nueva contraseña
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-[1.5] text-muted-foreground">
        Debe tener al menos {MIN_LENGTH} caracteres.
      </p>

      {!token ? (
        <div
          role="alert"
          className="mt-5 rounded-lg bg-destructive/8 px-3.5 py-3 text-sm font-semibold text-destructive"
        >
          El enlace está incompleto. Solicita uno nuevo desde{" "}
          <Link href="/forgot-password" className="underline">
            recuperar contraseña
          </Link>
          .
        </div>
      ) : (
        <>
          {error ? (
            <div
              role="alert"
              className="mt-5 rounded-lg bg-destructive/8 px-3.5 py-3 text-sm font-semibold text-destructive"
            >
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6">
            <label
              htmlFor="password"
              className="mb-[7px] block text-[12.5px] font-semibold text-[#3a4658]"
            >
              Contraseña
            </label>
            <InputGroup className="h-11 rounded-[9px]">
              <InputGroupAddon>
                <Lock />
              </InputGroupAddon>
              <InputGroupInput
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={MIN_LENGTH}
                autoComplete="new-password"
                className="h-11 text-[13.5px]"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>

            <button
              type="submit"
              disabled={loading}
              className="mt-5 h-[46px] w-full rounded-[10px] bg-primary text-[14.5px] font-bold text-primary-foreground shadow-[0_8px_20px_rgba(15,92,138,.25)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        </>
      )}

      <Link
        href="/login"
        className="mt-[18px] flex items-center justify-center gap-[7px] text-[13px] font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-[15px]" />
        Volver a iniciar sesión
      </Link>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
