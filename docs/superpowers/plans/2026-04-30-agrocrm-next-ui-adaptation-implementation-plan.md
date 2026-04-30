# AgroCRM Next UI Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the existing Next.js CRM interface to the Stitch `AgroCRM Operativo` visual structure without breaking current business flows.

**Architecture:** Build a reusable UI shell and design token layer first, then migrate the highest-value operational surfaces onto shared primitives. Keep server-side fetching and existing mutation patterns, but replace repeated inline styling and incomplete route protection with a cohesive application shell.

**Tech Stack:** Next.js App Router, React 19, TypeScript, existing `apiFetch`/`apiFetchClient` helpers, Playwright E2E.

---

## File structure

### New or expanded shared UI layer

- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/sidebar-nav.tsx`
- Create: `apps/web/src/components/topbar.tsx`
- Create: `apps/web/src/components/ui/page-header.tsx`
- Create: `apps/web/src/components/ui/section-card.tsx`
- Create: `apps/web/src/components/ui/stat-card.tsx`
- Create: `apps/web/src/components/ui/status-badge.tsx`
- Create: `apps/web/src/components/ui/empty-state.tsx`
- Create: `apps/web/src/components/ui/data-table.tsx`
- Create: `apps/web/src/components/ui/filter-bar.tsx`
- Create: `apps/web/src/components/ui/detail-section.tsx`
- Create: `apps/web/src/components/ui/form-section.tsx`
- Create: `apps/web/src/components/ui/inline-metric.tsx`
- Create: `apps/web/src/components/ui/button-link.tsx`
- Create: `apps/web/src/components/ui/theme.ts`

### Route and page migrations

- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(app)/customers/page.tsx`
- Modify: `apps/web/src/app/(app)/opportunities/page.tsx`
- Modify: `apps/web/src/app/(app)/orders/page.tsx`
- Create: `apps/web/src/app/(app)/billing-requests/page.tsx`
- Modify: `apps/web/src/middleware.ts`

### Optional polish targets if time permits in the same wave

- Modify: `apps/web/src/app/login/page.tsx`
- Modify: selected form/detail pages under `apps/web/src/app/(app)/*`

### Validation

- Test: `apps/web/tests/e2e/auth.spec.ts`
- Test: `apps/web/tests/e2e/customers.spec.ts`

## Task 1: Build the shared shell and theme foundation

**Files:**
- Create: `apps/web/src/components/ui/theme.ts`
- Create: `apps/web/src/components/sidebar-nav.tsx`
- Create: `apps/web/src/components/topbar.tsx`
- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/ui/button-link.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`

- [ ] **Step 1: Introduce the theme tokens and typed navigation config**

```ts
export const crmTheme = {
  colors: {
    background: "#f4f7fb",
    surface: "#ffffff",
    surfaceMuted: "#f5f3f6",
    text: "#10233f",
    textMuted: "#52637a",
    textSubtle: "#6b7c93",
    primary: "#10233f",
    primaryHover: "#1a3a5c",
    border: "#e2e8f0",
    success: "#1f8f5f",
    warning: "#c27b12",
    danger: "#ba3a2f",
    info: "#2d6cdf",
  },
  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
  },
  shadow: {
    card: "0 2px 8px rgba(16, 35, 63, 0.08)",
  },
  spacing: {
    page: "24px",
    section: "16px",
  },
} as const;

export const primaryNavItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Clientes" },
  { href: "/opportunities", label: "Oportunidades" },
  { href: "/agenda", label: "Agenda" },
  { href: "/visits", label: "Visitas" },
  { href: "/follow-ups", label: "Seguimientos" },
  { href: "/quotes", label: "Cotizaciones" },
  { href: "/orders", label: "Pedidos" },
  { href: "/billing-requests", label: "Facturacion" },
  { href: "/products", label: "Productos" },
  { href: "/segments", label: "Segmentos" },
] as const;
```

- [ ] **Step 2: Replace the bare authenticated header with a persistent app shell**

```tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "260px minmax(0, 1fr)",
        background: crmTheme.colors.background,
      }}
    >
      <SidebarNav />
      <div style={{ minWidth: 0 }}>
        <Topbar />
        <main style={{ padding: crmTheme.spacing.page }}>{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update root and app layouts to consume the new shell**

```tsx
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily: "Inter, sans-serif",
          backgroundColor: crmTheme.colors.background,
          color: crmTheme.colors.text,
        }}
      >
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run focused type/build verification**

Run: `pnpm --filter @norgtech/web build`
Expected: build completes without type errors from the new shell components.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/\(app\)/layout.tsx apps/web/src/components/app-shell.tsx apps/web/src/components/sidebar-nav.tsx apps/web/src/components/topbar.tsx apps/web/src/components/ui/theme.ts apps/web/src/components/ui/button-link.tsx
git commit -m "feat(web): add CRM shell and theme foundation"
```

## Task 2: Add reusable operational UI primitives

**Files:**
- Create: `apps/web/src/components/ui/page-header.tsx`
- Create: `apps/web/src/components/ui/section-card.tsx`
- Create: `apps/web/src/components/ui/stat-card.tsx`
- Create: `apps/web/src/components/ui/status-badge.tsx`
- Create: `apps/web/src/components/ui/empty-state.tsx`
- Create: `apps/web/src/components/ui/data-table.tsx`
- Create: `apps/web/src/components/ui/filter-bar.tsx`
- Create: `apps/web/src/components/ui/detail-section.tsx`
- Create: `apps/web/src/components/ui/form-section.tsx`
- Create: `apps/web/src/components/ui/inline-metric.tsx`

- [ ] **Step 1: Implement stat, status, and card primitives**

```tsx
export function StatCard({ label, value, tone = "info" }: StatCardProps) {
  return (
    <SectionCard>
      <div style={{ fontSize: "28px", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "13px", color: crmTheme.colors.textMuted }}>{label}</div>
    </SectionCard>
  );
}
```

- [ ] **Step 2: Implement page and list primitives for consistent list screens**

```tsx
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "24px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "24px" }}>{title}</h1>
        {description ? <p style={{ margin: "6px 0 0", color: crmTheme.colors.textMuted }}>{description}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: "12px" }}>{actions}</div> : null}
    </div>
  );
}
```

- [ ] **Step 3: Implement a generic dense table wrapper instead of per-page card lists**

```tsx
export function DataTable({ columns, rows }: DataTableProps) {
  return (
    <div style={{ overflowX: "auto", background: crmTheme.colors.surface, borderRadius: crmTheme.radius.lg, boxShadow: crmTheme.shadow.card }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>{/* compact operational headers */}</thead>
        <tbody>{/* reusable row rendering */}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run focused build verification**

Run: `pnpm --filter @norgtech/web build`
Expected: new primitives compile and do not introduce unresolved imports.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(web): add reusable CRM UI primitives"
```

## Task 3: Redesign the dashboard as an operational home

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`
- Reuse: `apps/web/src/components/ui/page-header.tsx`
- Reuse: `apps/web/src/components/ui/stat-card.tsx`
- Reuse: `apps/web/src/components/ui/section-card.tsx`
- Reuse: `apps/web/src/components/ui/button-link.tsx`
- Reuse: `apps/web/src/components/ui/empty-state.tsx`

- [ ] **Step 1: Preserve existing dashboard fetch contract and reshape the page into sections**

```tsx
const response = await apiFetch("/dashboard/summary");
const summary: DashboardSummary | null = response.ok ? await response.json() : null;
```

- [ ] **Step 2: Render the new dashboard using shared cards and grouped operational panels**

```tsx
return (
  <div style={{ display: "grid", gap: "24px" }}>
    <PageHeader
      title="Dashboard operativo"
      description="Resumen comercial, actividad reciente y proximas acciones."
      actions={<ButtonLink href="/opportunities/new">Nueva oportunidad</ButtonLink>}
    />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
      {kpiCards.map((card) => <StatCard key={card.key} label={card.label} value={formatValue(card, summary)} />)}
    </div>
  </div>
);
```

- [ ] **Step 3: Add recent activity and quick action panels without changing the backend**

```tsx
<SectionCard title="Actividad reciente">{/* map summary.recentActivity */}</SectionCard>
<SectionCard title="Acciones rapidas">{/* existing quick links as button links */}</SectionCard>
```

- [ ] **Step 4: Run dashboard smoke verification**

Run: `pnpm --filter @norgtech/web build`
Expected: dashboard compiles and uses only existing summary fields.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(web): redesign dashboard as operational workspace"
```

## Task 4: Migrate key list pages to dense operational layouts

**Files:**
- Modify: `apps/web/src/app/(app)/customers/page.tsx`
- Modify: `apps/web/src/app/(app)/opportunities/page.tsx`
- Modify: `apps/web/src/app/(app)/orders/page.tsx`
- Reuse: shared UI primitives under `apps/web/src/components/ui`

- [ ] **Step 1: Keep current server fetches and replace card stacks with uniform page headers plus table layouts**

```tsx
const response = await apiFetch("/customers");
const customers: Customer[] = response.ok ? await response.json() : [];
```

- [ ] **Step 2: Render customers in a dense table with customer, segment, location, and primary contact columns**

```tsx
<PageHeader title="Clientes" actions={<ButtonLink href="/customers/new">Nuevo cliente</ButtonLink>} />
{customers.length === 0 ? (
  <EmptyState title="No hay clientes registrados" />
) : (
  <DataTable columns={customerColumns} rows={customerRows} />
)}
```

- [ ] **Step 3: Render opportunities with stronger stage treatment and order list with visible commercial status**

```tsx
<StatusBadge tone={mapOpportunityStageTone(opportunity.stage)}>
  {stageLabels[opportunity.stage] ?? opportunity.stage}
</StatusBadge>
```

- [ ] **Step 4: Run focused build verification**

Run: `pnpm --filter @norgtech/web build`
Expected: customers, opportunities, and orders pages compile against the shared table abstractions.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/customers/page.tsx apps/web/src/app/\(app\)/opportunities/page.tsx apps/web/src/app/\(app\)/orders/page.tsx
git commit -m "feat(web): migrate core list views to operational layouts"
```

## Task 5: Add billing requests surface and protect the full private app

**Files:**
- Create: `apps/web/src/app/(app)/billing-requests/page.tsx`
- Modify: `apps/web/src/middleware.ts`
- Optional reuse: `apps/web/src/components/ui/page-header.tsx`
- Optional reuse: `apps/web/src/components/ui/data-table.tsx`
- Optional reuse: `apps/web/src/components/ui/status-badge.tsx`

- [ ] **Step 1: Add a server-rendered billing requests list page against the existing backend endpoint**

```tsx
const response = await apiFetch("/billing-requests");
const billingRequests: BillingRequest[] = response.ok ? await response.json() : [];
```

- [ ] **Step 2: Render billing requests with customer, origin, status, and creation date columns**

```tsx
<PageHeader title="Facturacion" description="Solicitudes generadas desde cotizaciones y pedidos." />
<DataTable columns={billingColumns} rows={billingRows} />
```

- [ ] **Step 3: Protect every private route mounted inside `(app)` instead of just three paths**

```ts
export const config = {
  matcher: ["/dashboard/:path*", "/customers/:path*", "/opportunities/:path*", "/quotes/:path*", "/orders/:path*", "/billing-requests/:path*", "/products/:path*", "/segments/:path*", "/visits/:path*", "/follow-ups/:path*", "/agenda/:path*"],
};
```

- [ ] **Step 4: Run build plus existing E2E smoke tests**

Run: `pnpm --filter @norgtech/web build`
Expected: build passes with the new page and middleware.

Run: `pnpm --filter @norgtech/web test:e2e`
Expected: existing auth/customers flows still pass, or failures are clearly attributable to test assumptions about old layout and are fixed before merge.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/billing-requests/page.tsx apps/web/src/middleware.ts
git commit -m "feat(web): add billing requests view and protect private routes"
```

## Self-review

- Spec coverage: shell, shared visual layer, dashboard, dense list views, billing requests, and route protection are all covered by explicit tasks.
- Placeholder scan: no `TODO`, `TBD`, or deferred pseudo-steps remain.
- Type consistency: all shared components referenced in later tasks are introduced in Task 1 or Task 2 before usage.
