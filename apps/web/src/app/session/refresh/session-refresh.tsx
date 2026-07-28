"use client";

import { useEffect } from "react";

import { refreshAccessToken } from "@/lib/api.client";
import { clearSessionClient, isTokenExpired } from "@/lib/auth";

// Guarda contra bucles: si el rebote se repite a los pocos segundos es que el
// token nuevo tampoco sirve para la ruta destino. Antes de quemar refresh tokens
// (cada POST /auth/refresh rota el de la BD) se manda al login.
const LOOP_GUARD_KEY = "session-refresh-at";
const LOOP_GUARD_MS = 10_000;

function goToLogin() {
  clearSessionClient();
  window.location.replace("/login?expired=1");
}

/**
 * El render de servidor no puede renovar la sesion (ver api.server.ts), asi que
 * el rebote llega aca: el navegador si tiene el cookie httpOnly `refresh_token`
 * del dominio de la API, y `refreshAccessToken` es el mismo mecanismo que ya usa
 * api.client.ts ante un 401.
 */
export function SessionRefresh({ next }: { next: string }) {
  useEffect(() => {
    let cancelled = false;

    const lastBounce = Number(window.sessionStorage.getItem(LOOP_GUARD_KEY) ?? 0);
    if (Date.now() - lastBounce < LOOP_GUARD_MS) {
      window.sessionStorage.removeItem(LOOP_GUARD_KEY);
      goToLogin();
      return;
    }
    window.sessionStorage.setItem(LOOP_GUARD_KEY, String(Date.now()));

    void refreshAccessToken().then((token) => {
      if (cancelled) return;
      if (!token || isTokenExpired(token)) {
        goToLogin();
        return;
      }
      // Navegacion dura: el servidor tiene que volver a renderizar leyendo el
      // cookie nuevo, un router.replace() reusaria el render cacheado.
      window.location.replace(next);
    });

    return () => {
      cancelled = true;
    };
  }, [next]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p role="status" className="text-sm text-muted-foreground">
        Renovando sesión…
      </p>
    </div>
  );
}
