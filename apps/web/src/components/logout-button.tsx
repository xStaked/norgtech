"use client";

import { useRouter } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    document.cookie = `${SESSION_COOKIE_NAME}=;path=/;max-age=0`;
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        backgroundColor: "transparent",
        border: "1px solid #dce7f7",
        color: "#dce7f7",
        padding: "0.375rem 0.75rem",
        borderRadius: "0.375rem",
        fontSize: "0.875rem",
        cursor: "pointer",
      }}
    >
      Salir
    </button>
  );
}
