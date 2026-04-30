"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";

interface FollowUpActionsProps {
  taskId: string;
}

export function FollowUpActions({ taskId }: FollowUpActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function markComplete() {
    setLoading(true);
    try {
      const response = await apiFetchClient(`/follow-up-tasks/${taskId}/complete`, {
        method: "PATCH",
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.75rem" }}>
      <button
        onClick={markComplete}
        disabled={loading}
        style={{
          padding: "0.625rem 1.25rem",
          borderRadius: "0.5rem",
          border: "none",
          backgroundColor: "#27ae60",
          color: "#ffffff",
          fontSize: "1rem",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        Marcar como completada
      </button>
    </div>
  );
}
