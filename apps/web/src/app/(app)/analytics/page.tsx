import { redirect } from "next/navigation";

/** `/analytics` no es una pantalla: la primera del modulo es Ventas. */
export default function AnalyticsIndexPage() {
  redirect("/analytics/ventas");
}
