import Link from "next/link";
import { SegmentForm } from "@/components/segments/segment-form";

export default function NewSegmentPage() {
  return (
    <div>
      <Link
        href="/segments"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a segmentos
      </Link>

      <h1 style={{ marginTop: 0 }}>Nuevo segmento</h1>

      <SegmentForm />
    </div>
  );
}
