"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, KeyRound, Mail, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { apiFetchClient } from "@/lib/api.client";

function BackToLogin() {
  return (
    <Link
      href="/login"
      className="mt-[18px] flex items-center justify-center gap-[7px] text-[13px] font-bold text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-[15px]" />
      Volver a iniciar sesión
    </Link>
  );
}

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestLink(email: string) {
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetchClient("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError("No pudimos enviar el enlace. Intenta de nuevo.");
        return;
      }
      setSentTo(email);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        headline={
          <>
            Revisa tu
            <br />
            correo.
          </>
        }
        blurb="El enlace expira en 30 minutos por seguridad. Si no lo ves, revisa tu carpeta de spam."
        glow="success"
      >
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-[60px] items-center justify-center rounded-full bg-[#e6f4ec]">
            <MailCheck className="size-[30px] text-primary" strokeWidth={1.6} />
          </div>
          <h1 className="text-[25px] font-extrabold tracking-[-0.02em] text-[#0c2c44]">
            Enlace enviado
          </h1>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground">
            Enviamos un enlace de recuperación a{" "}
            <b className="text-[#0c2c44]">{sentTo}</b>. Sigue las instrucciones del
            correo para crear una nueva contraseña.
          </p>

          {error ? (
            <div role="alert" className="mt-4 text-[12.5px] font-semibold text-destructive">
              {error}
            </div>
          ) : null}

          <p className="mt-[18px] text-[12.5px] text-[#9aa3b1]">
            ¿No recibiste el correo?{" "}
            <button
              type="button"
              disabled={loading}
              onClick={() => void requestLink(sentTo)}
              className="font-bold text-primary hover:underline disabled:opacity-60"
            >
              {loading ? "Reenviando…" : "Reenviar enlace"}
            </button>
          </p>
          <BackToLogin />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headline={
        <>
          ¿Olvidaste
          <br />
          tu contraseña?
        </>
      }
      blurb="No te preocupes. Te enviaremos un enlace seguro para restablecerla en segundos."
    >
      <div className="mb-[18px] flex size-12 items-center justify-center rounded-xl bg-[#e4f1f9]">
        <KeyRound className="size-5 text-[#0288c4]" />
      </div>
      <h1 className="text-[25px] font-extrabold tracking-[-0.02em] text-[#0c2c44]">
        Recuperar contraseña
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-[1.5] text-muted-foreground">
        Ingresa el correo asociado a tu cuenta y te enviaremos instrucciones para
        restablecer tu contraseña.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-lg bg-destructive/8 px-3.5 py-3 text-sm font-semibold text-destructive"
        >
          {error}
        </div>
      ) : null}

      <form
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          const email = String(new FormData(event.currentTarget).get("email"));
          void requestLink(email);
        }}
      >
        <label
          htmlFor="email"
          className="mb-[7px] block text-[12.5px] font-semibold text-[#3a4658]"
        >
          Correo electrónico
        </label>
        <InputGroup className="h-11 rounded-[9px]">
          <InputGroupAddon>
            <Mail />
          </InputGroupAddon>
          <InputGroupInput
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="tu@norgtech.co"
            className="h-11 text-[13.5px]"
          />
        </InputGroup>

        <button
          type="submit"
          disabled={loading}
          className="mt-5 h-[46px] w-full rounded-[10px] bg-primary text-[14.5px] font-bold text-primary-foreground shadow-[0_8px_20px_rgba(15,92,138,.25)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Enviando…" : "Enviar enlace de recuperación"}
        </button>
      </form>
      <BackToLogin />
    </AuthShell>
  );
}
