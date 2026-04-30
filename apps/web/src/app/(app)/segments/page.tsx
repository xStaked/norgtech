import { apiFetch } from "@/lib/api.server";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export default async function SegmentsPage() {
  const response = await apiFetch("/customer-segments");
  const segments: Segment[] = response.ok ? await response.json() : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Segmentos de cliente</h1>
      </div>

      {segments.length === 0 ? (
        <p style={{ color: "#52637a" }}>No hay segmentos registrados.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {segments.map((segment) => (
            <div
              key={segment.id}
              style={{
                backgroundColor: "#ffffff",
                padding: "1rem 1.25rem",
                borderRadius: "0.75rem",
                boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
              }}
            >
              <div style={{ fontWeight: 600 }}>{segment.name}</div>
              {segment.description && (
                <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                  {segment.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
