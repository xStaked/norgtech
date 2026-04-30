import Link from "next/link";
import { apiFetch } from "@/lib/api.server";
import { FollowUpTaskForm } from "@/components/follow-ups/follow-up-task-form";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

export default async function NewFollowUpPage() {
  const [customersRes, opportunitiesRes] = await Promise.all([
    apiFetch("/customers"),
    apiFetch("/opportunities"),
  ]);

  const customers: Customer[] = customersRes.ok ? await customersRes.json() : [];
  const opportunities: Opportunity[] = opportunitiesRes.ok ? await opportunitiesRes.json() : [];

  return (
    <div>
      <Link
        href="/follow-ups"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a seguimientos
      </Link>

      <h1 style={{ marginTop: 0 }}>Nueva tarea de seguimiento</h1>

      <FollowUpTaskForm customers={customers} opportunities={opportunities} />
    </div>
  );
}
