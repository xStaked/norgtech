import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Clientes" },
  { href: "/opportunities", label: "Oportunidades" },
  { href: "/quotes", label: "Cotizaciones" },
  { href: "/products", label: "Productos" },
  { href: "/segments", label: "Segmentos" },
  { href: "/visits", label: "Visitas" },
  { href: "/follow-ups", label: "Seguimientos" },
  { href: "/agenda", label: "Agenda" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 1.5rem",
          backgroundColor: "#10233f",
          color: "#ffffff",
        }}
      >
        <strong>Norgtech CRM</strong>
        <nav style={{ display: "flex", gap: "1rem" }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{ color: "#dce7f7", textDecoration: "none" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main style={{ padding: "1.5rem" }}>{children}</main>
    </div>
  );
}
