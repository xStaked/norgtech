"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { crmTheme } from "@/components/ui/theme";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    document.cookie = `${SESSION_COOKIE_NAME}=;path=/;max-age=0`;
    startTransition(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      style={{
        minHeight: 40,
        padding: "0 14px",
        borderRadius: crmTheme.radius.md,
        border: `1px solid ${crmTheme.colors.borderStrong}`,
        background: crmTheme.colors.surface,
        color: crmTheme.colors.text,
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Salir
    </button>
  );
}
