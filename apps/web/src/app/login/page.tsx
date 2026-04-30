"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api";
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
        padding: "2rem",
      }}
    >
      <section
        style={{
          width: "min(100%, 24rem)",
          backgroundColor: "#ffffff",
          borderRadius: "1rem",
          padding: "2rem",
          boxShadow: "0 12px 40px rgba(16, 35, 63, 0.08)",
        }}
      >
        <h1 style={{ marginTop: 0, color: "#10233f" }}>Ingresar</h1>

        {error && (
          <p style={{ color: "#c0392b", fontSize: "0.875rem" }}>{error}</p>
        )}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Correo</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-label="Correo"
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid #c8d3e0",
                fontSize: "1rem",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Contraseña</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              aria-label="Contraseña"
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid #c8d3e0",
                fontSize: "1rem",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "0.625rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#10233f",
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </section>
    </main>
  );
}
