# RBAC Hardening — Design Spec

**Date:** 2026-07-16
**Status:** Draft
**Feature:** P0.1 · Branch `fix/qa-p0-seguridad-dinero`
**Cierra:** RBAC-01, RBAC-02, RBAC-03, RBAC-04, RBAC-05, RBAC-06, RBAC-07, RBAC-08, RBAC-09, RBAC-10, RBAC-11, RBAC-12, RBAC-13, RBAC-14

---

## 1. Overview

Hoy la app **oculta acciones en la UI pero no protege la API ni las rutas**. Un usuario autenticado con rol Técnico/Facturación/Logística puede navegar por URL a formularios de creación (cliente, oportunidad, cotización, gasto, pedido, seguimiento, devolución, factura, visita) y, sobre todo, **llamar directamente a los endpoints** porque la mayoría no declara `@Roles()`. Esto es un hueco de seguridad explotable con una sesión válida.

La infraestructura ya existe: `apps/api/src/modules/auth/roles.guard.ts` (`RolesGuard`), `decorators/roles.decorator.ts` (`@Roles`), `ROLES_KEY`, `JwtAuthGuard`. **El trabajo es aplicarla de forma sistemática** en tres capas y con una única fuente de verdad.

### Decisiones de diseño

| Decisión | Valor (por defecto) |
|----------|---------------------|
| Fuente de verdad de permisos | Una matriz `rol × recurso × acción` compartida: `apps/api/src/modules/auth/permissions.ts` y su espejo en `apps/web/src/lib/permissions.ts` |
| Enforcement primario | **Backend** (`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` por endpoint). La UI es secundaria. |
| Guardas de ruta en front | `apps/web/src/middleware.ts` valida rol vs. ruta antes de render; redirige a `/` con aviso si no autorizado |
| Respuesta ante acceso no autorizado (API) | `403 Forbidden` con mensaje en español |
| RBAC-01 (Director comercial crea empresas) | **Confirmado (2026-07-16):** `administrador` **y** `director_comercial` gestionan Empresas y Zonas. |
| Rol del claim | Ya viene en el JWT (`role`) y en `request.user.role`; no requiere query extra |

### Fuera de scope

- Permisos a nivel de campo (field-level).
- Permisos por empresa/zona (multi-tenant fino). El scope actual es por rol global.
- Refactor del login/token (va en P0.2).

---

## 2. Matriz de permisos (borrador)

Roles: `administrador`, `director_comercial`, `comercial`, `tecnico`, `facturacion`, `logistica`.

| Recurso / acción | admin | director_comercial | comercial | tecnico | facturacion | logistica |
|------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Empresas (CRUD) | ✅ | ✅¹ | ❌ | ❌ | ❌ | ❌ |
| Zonas (CRUD) | ✅ | ✅¹ | ❌ | ❌ | ❌ | ❌ |
| Cliente (crear/editar) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Oportunidad (crear) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cotización (crear) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Pedido (crear) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Gasto comercial (crear) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Tarea de seguimiento (crear) | ✅ | ✅ | ✅ | ✅² | ❌ | ❌ |
| Visita (crear) | ✅ | ✅ | ✅ | ✅² | ❌ | ❌ |
| Devolución (crear) | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Factura / solicitud facturación | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Logística de pedido (guía, despacho) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Dashboard "Control comercial avanzado" | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

¹ Confirmado: Director comercial gestiona Empresas y Zonas (RBAC-01). ² Técnico crea visitas/seguimientos porque hace visitas de campo (confirmar contra la operación real).

> Esta tabla es el borrador de trabajo. El primer task del plan será **validarla con Sergio** y congelarla, porque de ella dependen los `@Roles()` de todos los endpoints.

---

## 3. API Layer (enforcement real)

### 3.1 Módulo `permissions`

`apps/api/src/modules/auth/permissions.ts`:

```typescript
import { UserRole } from "@prisma/client";

export const ROLE_GROUPS = {
  COMMERCIAL_WRITERS: [UserRole.administrador, UserRole.director_comercial, UserRole.comercial],
  BILLING: [UserRole.administrador, UserRole.director_comercial, UserRole.facturacion],
  LOGISTICS: [UserRole.administrador, UserRole.logistica],
  ADMIN_ONLY: [UserRole.administrador],
  ADMIN_AND_DIRECTOR: [UserRole.administrador, UserRole.director_comercial], // Empresas y Zonas (RBAC-01)
  FIELD_OPS: [UserRole.administrador, UserRole.director_comercial, UserRole.comercial, UserRole.tecnico],
} as const;
```

### 3.2 Aplicar guards por endpoint

Patrón para cada controller de escritura. Ejemplo `customers.controller.ts`:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("customers")
export class CustomersController {
  @Post()
  @Roles(...ROLE_GROUPS.COMMERCIAL_WRITERS)
  create(...) { ... }
}
```

Controllers a intervenir (uno por incidencia RBAC-04…12) y el grupo que aplica:

| Controller | Endpoint(s) protegidos | Grupo | Incidencia |
|------------|------------------------|-------|-----------|
| `customers.controller.ts` | `POST`, `PATCH` | COMMERCIAL_WRITERS | RBAC-04 |
| `opportunities.controller.ts` | `POST` | COMMERCIAL_WRITERS | RBAC-05 |
| `quotes.controller.ts` | `POST` | COMMERCIAL_WRITERS | RBAC-06 |
| `commercial-expenses.controller.ts` | `POST` | COMMERCIAL_WRITERS | RBAC-07 |
| `orders.controller.ts` | `POST` | COMMERCIAL_WRITERS | RBAC-08 |
| `follow-up-tasks.controller.ts` | `POST` | FIELD_OPS | RBAC-09 |
| `returns.controller.ts` | `POST` | BILLING + comercial | RBAC-10 |
| `invoices.controller.ts` | `POST` | BILLING | RBAC-11 |
| `visits.controller.ts` | `POST` | FIELD_OPS | RBAC-12 |
| `companies.controller.ts` | `POST`,`PATCH`,`DELETE` | ADMIN_AND_DIRECTOR | RBAC-01, RBAC-02 |
| `zones.controller.ts` | `POST`,`PATCH`,`DELETE` | ADMIN_AND_DIRECTOR | RBAC-03 |

> **Auditoría de cobertura:** un task del plan hará un barrido de TODOS los `@Post/@Patch/@Delete` en `src/modules/**/*.controller.ts` para garantizar que ninguno de escritura quede sin `@Roles()`. Se listará en el report lo que quede intencionalmente abierto (p. ej. `auth/login`, webhooks de WhatsApp con `service-token.guard`).

### 3.3 `RolesGuard` — sin cambios de lógica

`roles.guard.ts` ya funciona: si no hay `@Roles`, deja pasar (`return true`). Por eso el bug es "endpoints sin decorador". No se modifica el guard; se **agrega el decorador donde falta**. Opcional: cambiar el default a "denegar si no hay roles declarados" es más seguro pero rompería endpoints públicos legítimos — se descarta en esta iteración para no introducir regresiones.

---

## 4. Frontend

### 4.1 Guardas de ruta — `apps/web/src/middleware.ts`

Extender el middleware para mapear prefijos de ruta → roles permitidos y redirigir si el rol del usuario (leído del token/cookie) no está autorizado. Cubre RBAC-04…12 (navegación directa por URL) y RBAC-20 (visita/logística).

```typescript
const ROUTE_ROLES: { prefix: string; roles: UserRole[] }[] = [
  { prefix: "/companies", roles: ADMIN_AND_DIRECTOR },
  { prefix: "/zones", roles: ADMIN_AND_DIRECTOR },
  { prefix: "/customers/new", roles: COMMERCIAL_WRITERS },
  { prefix: "/opportunities/new", roles: COMMERCIAL_WRITERS },
  { prefix: "/quotes/new", roles: COMMERCIAL_WRITERS },
  { prefix: "/orders/new", roles: COMMERCIAL_WRITERS },
  { prefix: "/expenses/new", roles: COMMERCIAL_WRITERS },
  { prefix: "/follow-ups/new", roles: FIELD_OPS },
  { prefix: "/visits/new", roles: FIELD_OPS },
  { prefix: "/returns/new", roles: [...BILLING, "comercial"] },
  { prefix: "/invoices/new", roles: BILLING },
];
```

### 4.2 Menú lateral — visibilidad por rol

En el componente del sidebar (`apps/web/src/components/**` / layout de `(app)`), filtrar los ítems de menú según rol usando el mismo `permissions.ts` del front:
- Ocultar **Empresas** y **Zonas** salvo `administrador` y `director_comercial` → RBAC-02, RBAC-03.

### 4.3 Dashboard — sección "Control comercial avanzado"

En `apps/web/src/app/(app)/dashboard`, no renderizar la sección "Control comercial avanzado" para `comercial` → RBAC-13. (El dato ya lo restringe el backend en P1.4, pero la sección debe ocultarse igual.)

### 4.4 Módulo Pedidos — botón "Ver facturación"

En la vista de Pedidos, ocultar el botón **Ver facturación** para roles sin acceso a facturación (todos menos `administrador`, `director_comercial`, `facturacion`) → RBAC-14.

---

## 5. Validation Flow

```
Request a POST /orders con token de rol "tecnico"
  JwtAuthGuard → válida token, setea request.user = { role: tecnico }
  RolesGuard → requiredRoles = COMMERCIAL_WRITERS; tecnico ∉ → 403
  (nunca llega al servicio)

Navegación por URL a /orders/new con sesión "logistica"
  middleware.ts → ruta /orders/new exige COMMERCIAL_WRITERS; logistica ∉ → redirect "/"
```

---

## 6. Edge Cases & Error Handling

| Caso | Comportamiento |
|------|----------------|
| Endpoint sin `@Roles` tras el barrido | Se documenta explícitamente por qué queda abierto |
| Token válido pero rol removido del sistema | `RolesGuard` compara contra enum; rol inexistente → 403 |
| Admin siempre pasa | `administrador` se incluye en todos los grupos |
| Front y back en desacuerdo | El back manda: aunque la UI muestre algo, el 403 protege |
| Deep-link legítimo (ej. facturación abre pedido) | El grupo BILLING incluye lectura del pedido; solo se restringe la **creación**/acciones, no la lectura donde aplique |

---

## 7. Decisión — RESUELTA

**RBAC-01 (2026-07-16):** `director_comercial` **sí** gestiona Empresas y Zonas. Se usa el grupo `ADMIN_AND_DIRECTOR` en §2, §3.1/3.2 y §4.1/4.2. *(Zonas se elevó junto a Empresas por ir en el mismo bloque de menú; si Zonas debe quedar solo-admin, es un ajuste de una línea.)*

---

## 8. Testing Checklist

### API (e2e — `apps/api/test`)

- [ ] Por cada controller de la tabla §3.2: rol autorizado → 2xx; rol no autorizado → 403 (usar las 6 credenciales del reporte QA).
- [ ] `POST /companies` y `POST /zones` → 403 para todos menos admin.
- [ ] Barrido: test que enumera rutas de escritura y falla si alguna no tiene metadata `ROLES_KEY`.
- [ ] `administrador` pasa en todos.

### Frontend (Playwright — `apps/web/tests`)

- [ ] Login como `logistica` → navegar a `/orders/new` redirige fuera.
- [ ] Login como `tecnico` → `/customers/new`, `/quotes/new`, `/invoices/new` redirigen.
- [ ] Sidebar: `comercial` no ve Empresas/Zonas; `administrador` sí.
- [ ] Dashboard: `comercial` no ve "Control comercial avanzado".
- [ ] Pedidos: botón "Ver facturación" oculto para `logistica`/`tecnico`/`comercial`.
