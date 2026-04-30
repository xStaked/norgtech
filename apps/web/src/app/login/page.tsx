"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crmTheme } from "@/components/ui/theme";
import { apiFetchClient } from "@/lib/api.client";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        document.cookie = `${SESSION_COOKIE_NAME}=${token};path=/;max-age=86400`;
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
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at top left, rgba(45, 108, 223, 0.12), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #eef4fa 100%)",
      }}
    >
      <section
        style={{
          width: "min(100%, 430px)",
          display: "grid",
          gap: 24,
          padding: "32px",
          borderRadius: crmTheme.radius.xl,
          background: "rgba(255,255,255,0.92)",
          border: `1px solid ${crmTheme.colors.border}`,
          boxShadow: crmTheme.shadow.floating,
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 56,
              height: 56,
              borderRadius: 18,
              background: "linear-gradient(135deg, #f0b543 0%, #f7d06b 100%)",
              color: crmTheme.colors.primary,
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            NT
          </div>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: crmTheme.colors.info,
            }}
          >
            Acceso operativo
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 34,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: crmTheme.colors.text,
            }}
          >
            Ingresar
          </h1>
          <p style={{ margin: 0, color: crmTheme.colors.textMuted, lineHeight: 1.5 }}>
            Accede al CRM comercial para gestionar clientes, pipeline, cotizaciones y ejecución diaria.
          </p>
        </div>

        {error ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: crmTheme.radius.md,
              background: "rgba(186, 58, 47, 0.08)",
              color: crmTheme.colors.danger,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: crmTheme.colors.text }}>
              Correo
            </span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-label="Correo"
              style={{
                minHeight: 46,
                padding: "0 14px",
                borderRadius: crmTheme.radius.md,
                border: `1px solid ${crmTheme.colors.borderStrong}`,
                background: "#ffffff",
                color: crmTheme.colors.text,
                fontSize: 15,
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: crmTheme.colors.text }}>
              Contraseña
            </span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              aria-label="Contraseña"
              style={{
                minHeight: 46,
                padding: "0 14px",
                borderRadius: crmTheme.radius.md,
                border: `1px solid ${crmTheme.colors.borderStrong}`,
                background: "#ffffff",
                color: crmTheme.colors.text,
                fontSize: 15,
                outline: "none",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              minHeight: 48,
              border: 0,
              borderRadius: crmTheme.radius.md,
              background: crmTheme.colors.primary,
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.72 : 1,
              boxShadow: crmTheme.shadow.card,
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </section>
    </main>
  );
}
