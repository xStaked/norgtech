"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crmTheme } from "@/components/ui/theme";
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
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={markComplete}
        disabled={loading}
        style={{
          minHeight: 44,
          padding: "0 16px",
          borderRadius: crmTheme.radius.md,
          border: 0,
          background: crmTheme.colors.success,
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.72 : 1,
        }}
      >
        Marcar como completada
      </button>
    </div>
  );
}
