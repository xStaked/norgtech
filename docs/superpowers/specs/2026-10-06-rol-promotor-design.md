# Rol Promotor — Design Spec

**Fecha:** 2026-10-06
**Estado:** aprobado por producto, pendiente plan de implementación
**Enfoque elegido:** A — nuevo valor `promotor` en `UserRole`, tratado como admin en todo excepto analítica/desempeño propio.

## 1. Definición

El rol `promotor` es para personal del área comercial con poderes de administración
(gestiona todo: clientes, pedidos, cotizaciones, facturación, cartera, usuarios,
empresas, zonas), con una única restricción: **analítica y desempeño solo propio**.
No ve el desempeño de los demás ni la analítica global.

Decisiones de producto (2026-10-06):
- Datos: ve TODO como admin (sin scoping a cartera propia).
- Analítica/desempeño: solo lo propio (como comercial).
- WhatsApp unicanal: supervisor (ve todo, sin ruteo de atención).

## 2. Datos (paso 0, bloqueante)

- Agregar `promotor` al `enum UserRole` en `apps/api/prisma/schema.prisma`.
- Migración Postgres: `ALTER TYPE "UserRole" ADD VALUE 'promotor'` (solo agrega
  valor, no rompe existentes, sin downtime).
- Regenerar Prisma Client (API, web y agentes que lo usen).

## 3. Backend (API NestJS)

Regla general: **promotor = admin**. En cada `@Roles("administrador", ...)` se
agrega `"promotor"`: clientes, pedidos, oportunidades, cotizaciones, visitas,
seguimientos, facturas, devoluciones, productos, listas de precio, gastos,
reportes, solicitudes de facturación, usuarios, empresas, zonas, comisiones,
 WhatsApp/bandeja, dashboard, crédito.

Sin cambios necesarios donde ya funciona por omisión:
- Los checks `user.role === "comercial"` que acotan cartera NO tocan a promotor
  → ve todo automáticamente (clientes, pedidos, facturas, devoluciones, etc.).

Excepciones (ve solo lo propio, como comercial):
- `analytics.shared.resolveFilters`: forzar `sellerUserId = user.id` también cuando
  `role === "promotor"`. El `@Roles` de `AnalyticsController` incluye a promotor.
- Ledger de comisiones (`CommissionsService.findCommissions`): mismo forzado.
- `isControlRole` (facturas: updateStatus/createPayment; gastos): incluye promotor.
- `canAssignCustomers` (web + validación espejo): incluye promotor (reparte
  cartera como dirección).
- Dashboard `getSummary`: KPIs sin acotar (como admin), pero `recentActivity`
  sin acotar también (es su operación); se ocultan widgets de desempeño ajeno
  en el front. `commercial-advanced` se acota a sí mismo para promotor.
- `seller-goals`: NO accesible para promotor (desempeño ajeno por definición).
- WhatsApp unicanal (`unicanal-roles.ts`): promotor en
  `UNICANAL_SUPERVISOR_ROLES` (ve todo, no atiende, no recibe ruteo).

## 4. Frontend (web Next.js)

- `lib/auth.ts`: `promotor` en `USER_ROLES` + `ROLE_LABELS` ("Promotor").
  `moduleAccess`: promotor junto a admin en todos los módulos INCLUIDO `/analytics`
  (la API lo acota a sí mismo, igual que al comercial).
  `canCreate` y `canAssignCustomers`: como admin.
- `lib/theme.ts` nav (`requiredRoles`), `lib/route-guards.ts`, `middleware.ts`:
  promotor junto a admin en cada entrada correspondiente.
- Dashboard (`(app)/dashboard/page.tsx`): oculta `SellerGoalsDashboard` para
  promotor (desempeño ajeno); `CommercialAdvancedDashboard` lo muestra acotado
  a sí mismo por la API; resto igual que admin.
- Ruta `/analytics`: accesible para promotor pero acotada a sí mismo por la API
  (el `sellerUserId` que mande se ignora).

## 5. Nora (agente WhatsApp, Python)

- `agents/nora/src/roles.py` (`role_from_token`, listas de roles): acepta
  `promotor`; las tools ya filtran por JWT así que heredan el comportamiento
  del API sin cambios.
- Prompt del agente general: al promotor le muestra toda la operación, pero
  analítica/desempeño solo propio.
- Sin cambios en `NestJSClient` (ya forwardea el JWT del usuario).

## 6. Tests y seed

- `apps/api/test/helpers/login-as.ts`: helper para loguearse como promotor.
- Seed: usuario promotor de prueba.
- E2E nuevos: promotor ve todos los clientes/pedidos; promotor recibe 403 en
  seller-goals y en analytics ajenos; analytics propio OK; puede asignar
  cartera y activar clientes.

## 7. Criterios de aceptación

1. Login como promotor funciona y el JWT trae `role: promotor`.
2. `GET /customers`, `/orders`, `/quotes`, `/opportunities` sin filtro devuelven
   TODO (igual que admin).
3. `GET /analytics/*` con `sellerUserId` ajeno lo ignora y devuelve solo lo
   propio; `GET /dashboard/seller-goals` → 403.
4. Puede crear/reassignar/activar clientes y aprobar flujos como admin.
5. Web: ve todos los módulos INCLUIDO `/analytics` (el API lo acota a sí mismo,
   igual que al comercial); dashboard sin widgets de desempeño ajeno (oculta
   `SellerGoalsDashboard`; `CommercialAdvancedDashboard` acotado a sí mismo).
6. Suite e2e existente sigue verde (solo el fallo pre-existente conocido).
