"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { apiFetchClient } from "@/lib/api.client";
import { setSessionTokenClient } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));

    try {
      const response = await apiFetchClient("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError("Credenciales inválidas");
        setLoading(false);
        return;
      }

      const data = await response.json();
      const token = data.accessToken;

      if (token) {
        setSessionTokenClient(token);
        router.push("/dashboard");
      } else {
        setError("Respuesta inesperada del servidor");
        setLoading(false);
      }
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      headline={
        <>
          Tu operación comercial,
          <br />
          en un solo lugar.
        </>
      }
      blurb="Pedidos, cartera, visitas y metas — con Magali, tu asistente de IA, integrada a WhatsApp."
      stats={[
        { value: "2.4k", label: "pedidos / mes" },
        { value: "98%", label: "entregas a tiempo" },
        { value: "24/7", label: "asistente Magali" },
      ]}
    >
      <h1 className="text-[25px] font-extrabold tracking-[-0.02em] text-[#0c2c44]">
        Iniciar sesión
      </h1>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">
        Ingresa a tu cuenta de Norgtech.
      </p>

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

        <div className="mt-4 mb-[7px] flex items-center justify-between">
          <label
            htmlFor="password"
            className="text-[12.5px] font-semibold text-[#3a4658]"
          >
            Contraseña
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-bold text-primary hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <InputGroup className="h-11 rounded-[9px]">
          <InputGroupAddon>
            <Lock />
          </InputGroupAddon>
          <InputGroupInput
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className="h-11 text-[13.5px]"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <button
          type="submit"
          disabled={loading}
          className="mt-[22px] h-[46px] w-full rounded-[10px] bg-primary text-[14.5px] font-bold text-primary-foreground shadow-[0_8px_20px_rgba(15,92,138,.25)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Ingresando…" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-[#9aa3b1]">
        ¿Problemas para entrar?{" "}
        <a
          href="mailto:soporte@norgtech.co"
          className="font-bold text-primary hover:underline"
        >
          Contacta a soporte
        </a>
      </p>
    </AuthShell>
  );
}
