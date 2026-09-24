# ESLint 9 monorepo (lint + enforcement sin CI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar ESLint 9 con type-aware rules en `apps/web` y `apps/api`, dejar la línea base en cero violaciones (610 hoy), y bloquear pushes/deploys con lint fallido vía hook pre-push + build de Dokploy.

**Architecture:** Un `eslint.config.mjs` raíz (flat) heredado por ambas apps: type-aware (`recommendedTypeChecked`) para código fuente, `recommended` simple para tests. Fixes existentes categorizados con recipes deterministas; enforcement con `simple-git-hooks` (pre-push → `pnpm lint`) y `pnpm lint &&` en el build command de Dokploy.

**Tech Stack:** ESLint 9.39, typescript-eslint 8.70, @next/eslint-plugin-next 16.2.4, eslint-plugin-react-hooks 7.1, simple-git-hooks 2.14.

**Spec:** `docs/superpowers/specs/2026-09-24-eslint-monorepo-design.md`

**Contexto verificado (sondeo real, 2026-09-24):** 610 problemas = 572 errores + 38 warnings (`apps/web` 400, `apps/api` src+prisma 161, `apps/api/test` 49, tests de web 0). Después de cada tarea de fixes, la salida de `eslint` es la fuente de verdad autoritativa; los conteos pueden variar ±pocos si el repo cambió.

---

### Task 1: Instalar dependencias

**Files:**
- Modify: `package.json` (raíz), `pnpm-lock.yaml`
- Modify: `apps/api/package.json` (devDep `@types/jsonwebtoken`)

- [ ] **Step 1: Instalar devDeps raíz**

```bash
pnpm add -D -w eslint@^9.39.5 @eslint/js@^9.39.5 typescript-eslint@^8.70.1 globals@^17.12.0 simple-git-hooks@^2.14.0 @next/eslint-plugin-next@16.2.4 eslint-plugin-react-hooks@^7.1.1
```

`@next/eslint-plugin-next` va fijado a `16.2.4` para coincidir con el `next` instalado (16.2.4 en `apps/web`).

- [ ] **Step 2: Instalar `@types/jsonwebtoken` en api**

`jsonwebtoken@9` no trae tipos; sin ellos `import ... from "jsonwebtoken"` no compila bajo `strict`.

```bash
pnpm --filter @norgtech/api add -D @types/jsonwebtoken@^9
```

- [ ] **Step 3: Verificar versiones instaladas**

```bash
node -e "for (const p of ['eslint','typescript-eslint','@next/eslint-plugin-next','eslint-plugin-react-hooks','simple-git-hooks']) console.log(p, require(p + '/package.json').version)"
```

Expected: imprime las 5 versiones (eslint 9.39.x, typescript-eslint 8.70.x, plugin-next 16.2.4, react-hooks 7.x, simple-git-hooks 2.x). Falla con `MODULE_NOT_FOUND` si algo faltó.

---

### Task 2: Crear `eslint.config.mjs`

**Files:**
- Create: `eslint.config.mjs` (raíz del monorepo)

- [ ] **Step 1: Escribir la config completa**

```js
import globals from "globals";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

/** Los configs de plugins declaran severidades "warn"; la política del repo es
 *  cero warnings (--max-warnings=0), así que los normalizamos a "error" para
 *  que el reporte refleje la política real. */
const errorsOnly = (config) => ({
  ...config,
  rules: Object.fromEntries(
    Object.entries(config.rules).map(([rule, severity]) => [
      rule,
      severity === "warn" ? "error" : severity,
    ]),
  ),
});

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.pnpm-store/**",
      "**/.worktrees/**",
      "**/.pytest_cache/**",
      "**/.claude/**",
      "**/.superpowers/**",
      "docs/**",
      "agents/**",
      "packages/shared/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "**/*.sql",
    ],
  },
  // Base para todo el TS del repo (incluye tests).
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Type-aware SOLO para código fuente que vive en un tsconfig.
  // Tests quedan fuera: en e2e, res.json() -> any y el type-aware solo castiga
  // estilo (2.200 falsos positivos), no caza bugs.
  {
    files: ["apps/api/**/*.{ts,tsx}", "apps/web/**/*.{ts,tsx}"],
    ignores: ["apps/api/test/**", "apps/web/tests/**", "**/*.test.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Reglas de Next.js + React 19 para el front.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [
      errorsOnly(nextPlugin.configs["core-web-vitals"]),
      errorsOnly(reactHooks.configs.flat["recommended-latest"]),
    ],
    rules: {
      // No aplica en App Router; sin pages/ solo imprime ruido en stderr.
      "@next/next/no-html-link-for-pages": "off",
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  // Tests e2e: any de res.json() es aceptable por diseño (decisión del dueño).
  {
    files: ["apps/api/test/**/*.ts", "apps/web/tests/**/*.ts", "**/*.test.ts"],
    rules: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- res.json() en e2e es any por diseño; tipar respuestas de test no protege producción
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
```

Notas críticas verificadas en el sondeo:
- `reactHooks.configs.flat["recommended-latest"]` (no `configs["recommended-latest"]`, ese tiene `plugins` como array y rompe flat config).
- `nextPlugin.configs["core-web-vitals"]` ya es formato flat (`{name, plugins, rules}`).
- `projectService` + `tsconfigRootDir` permite que ESLint encuentre los tsconfigs de `apps/*` sin config extra.

- [ ] **Step 2: Correr ESLint y ver la línea base**

```bash
pnpm exec eslint . --max-warnings=0
```

Expected: **exit 1**, reporta ≈610 problemas (572 errors, 38 warnings) con las reglas mapeadas en el header de este plan. Si falla con error de config (p. ej. plugins array), revisar Step 1 — no proceder hasta que la config cargue.

---

### Task 3: Scripts raíz + hook pre-push

**Files:**
- Modify: `package.json` (raíz)

- [ ] **Step 1: Reemplazar el script `lint` y agregar `prepare` + config de hooks**

En `package.json` raíz, reemplazar `"lint": "pnpm -r lint"` (era un no-op) por:

```json
"scripts": {
  "dev": "pnpm -r --parallel dev",
  "dev:api": "pnpm --filter @norgtech/api dev",
  "dev:web": "pnpm --filter @norgtech/web dev",
  "build": "pnpm -r build",
  "lint": "eslint . --max-warnings=0",
  "test": "pnpm -r test",
  "prepare": "simple-git-hooks || true"
},
"simple-git-hooks": {
  "pre-push": "pnpm lint"
}
```

- `--max-warnings=0`: cualquier warning (incluidos los 38 `eslint-disable` obsoletos) bloquea.
- `|| true` en `prepare`: Dokploy/Docker a veces corre `pnpm install` sin `.git`; sin el guard, el deploy fallaría. El hook local se verifica explícitamente en Step 3.

- [ ] **Step 2: Instalar el hook**

```bash
pnpm install
```

- [ ] **Step 3: Verificar que el hook quedó instalado**

```bash
cat .git/hooks/pre-push
```

Expected: el archivo existe y contiene `pnpm lint`. Si no existe, correr `pnpm exec simple-git-hooks` y volver a verificar.

- [ ] **Step 4: Correr el lint vía script oficial**

```bash
pnpm lint
```

Expected: exit 1 con ≈610 problemas (mismo conteo que Task 2 Step 2). Desde aquí hasta Task 8, cualquier `git push` quedará bloqueado por el hook — eso es intencional.

---

### Task 4: Fix de `tsc` en specs de Playwright (5 errores)

**Files:**
- Modify: `apps/web/tests/e2e/orders.spec.ts:4,21,30`
- Modify: `apps/web/tests/e2e/reports.spec.ts:4,21`

- [ ] **Step 1: Reproducir los errores de tsc**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: 5 errores `TS2339: Property 'fixtures' does not exist on type 'TestType<...>'`.

- [ ] **Step 2: Reemplazar `ReturnType<typeof test.fixtures>` por tipos de Playwright**

En `orders.spec.ts`, cambiar el import línea 1:

```ts
// antes
import { expect, test } from "@playwright/test";
// después
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
```

Y reemplazar las 3 firmas:

```ts
// antes
async function waitForBackend(request: ReturnType<typeof test.fixtures>["request"]) {
async function getAdminToken(request: ReturnType<typeof test.fixtures>["request"]) {
async function loginAsAdmin(page: ReturnType<typeof test.fixtures>["page"]) {
// después
async function waitForBackend(request: APIRequestContext) {
async function getAdminToken(request: APIRequestContext) {
async function loginAsAdmin(page: Page) {
```

En `reports.spec.ts`, mismo cambio de import y las 2 firmas:

```ts
async function waitForBackend(request: APIRequestContext) {
async function loginAsAdmin(page: Page) {
```

- [ ] **Step 3: Verificar tsc verde**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json && npx tsc --noEmit -p apps/api/tsconfig.json
```

Expected: exit 0, sin salida.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/orders.spec.ts apps/web/tests/e2e/reports.spec.ts
git commit -m "fix(tests): tipa helpers de Playwright con APIRequestContext/Page en vez de test.fixtures"
```

---

### Task 5: Baseline de tests (49 problemas → 0)

**Files:**
- Modify: `apps/api/test/auth-password-reset.e2e-spec.ts:7-9`
- Modify: `apps/api/test/auth-refresh.e2e-spec.ts:7-10`
- Modify: 9 archivos `apps/api/test/*.e2e-spec.ts` con vars sin uso (lista en Step 4)

- [ ] **Step 1: Auto-fix — elimina los 38 `eslint-disable` obsoletos**

```bash
pnpm exec eslint apps/api/test --fix
pnpm exec eslint apps/api/test
```

Expected tras `--fix`: bajan de 49 a ≈11 problemas, todos en `no-unused-vars` (9) y `no-require-imports` (2).

- [ ] **Step 2: Convertir los 2 `require()` legados**

`auth-password-reset.e2e-spec.ts` líneas 7-9:

```ts
// antes
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require("bcryptjs") as {
  compare(value: string, hash: string): Promise<boolean>;
};

// después
import bcrypt from "bcryptjs";
```

(`bcryptjs@3` trae sus propios tipos; `compare` ya existe tipado, el `as` local sobra.)

`auth-refresh.e2e-spec.ts` líneas 7-10 (el alias local se mantiene porque sus tipos son más estrechos que los de `@types/jsonwebtoken`):

```ts
// antes
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsonwebtoken = require("jsonwebtoken") as {
  decode(token: string): { exp: number; iat: number } | null;
  verify(token: string, secret: string): unknown;
};

// después (import sube junto a los otros imports; el const conserva el nombre
// que ya usan los call sites del archivo)
import jsonwebtokenPkg from "jsonwebtoken";
const jsonwebtoken = jsonwebtokenPkg as unknown as {
  decode(token: string): { exp: number; iat: number } | null;
  verify(token: string, secret: string): unknown;
};
```

- [ ] **Step 3: Listar los `no-unused-vars` restantes**

```bash
pnpm exec eslint apps/api/test --format unix
```

Expected: ≈9 líneas. Ubicaciones conocidas del sondeo: `commercial-expenses:18`, `invoices:302`, `nora-agent:620,647`, `notifications-service:1`, `orders:553`, `whatsapp:994,1040,1041`.

- [ ] **Step 4: Arreglar cada uno**

Regla única: si es un import sin usar → borrar el specifier de la lista; si es una variable/param sin uso → ponerle prefijo `_` (los `^_` están habilitados en la config). Ejemplo:

```ts
// antes
import { UserRole, OrderStatus } from "@prisma/client";  // OrderStatus sin usar
// después
import { UserRole } from "@prisma/client";
```

- [ ] **Step 5: Verificar tests verdes**

```bash
pnpm exec eslint "apps/api/test/**/*.ts" "apps/web/tests/**/*.ts" "**/*.test.ts"
```

Expected: exit 0, 0 problemas.

- [ ] **Step 6: Commit**

```bash
git add apps/api/test
git commit -m "chore(lint): baseline de tests — borra eslint-disable legados, require() y vars sin uso"
```

---

### Task 6: Baseline de API source (161 → 0)

**Files:**
- Create: `apps/api/src/modules/audit/audit-state.ts`
- Modify: 54 sitios `JSON.parse(JSON.stringify(...))` en 12 services (lista abajo)
- Modify: `apps/api/src/modules/auth/auth.service.ts`, `jwt.strategy.ts`, `users.service.ts`, `apps/api/prisma/seed.ts` (requires)
- Modify: los demás archivos listados por `eslint` (receta por regla en Step 4)

- [ ] **Step 1: Crear el helper de snapshots de auditoría**

El patrón `JSON.parse(JSON.stringify(x))` genera `any` y explica ~50 de los 76 `no-unsafe-assignment` de api (54 sitios en el repo). Create `apps/api/src/modules/audit/audit-state.ts`:

```ts
import { Prisma } from "@prisma/client";

/**
 * Snapshot JSON-safe de un registro para los campos Json de AuditLog.
 * Misma semántica que JSON.parse(JSON.stringify(x)) (fechas -> string,
 * undefined -> omitido), pero tipado para no filtrar `any`.
 */
export function auditState(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
```

- [ ] **Step 2: Reemplazar los 54 call sites**

```bash
grep -rn "JSON.parse(JSON.stringify" apps/api/src
```

En cada ocurrencia: reemplazar `JSON.parse(JSON.stringify(X))` por `auditState(X)` y agregar el import:

```ts
import { auditState } from "../../audit/audit-state";
```

(ajustar ruta relativa según el módulo; desde `src/modules/orders/...` es `../../audit/audit-state`).

Distribución conocida: `orders.service` 14, `visits.service` 8, `follow-up-tasks.service` 5, `commercial-expenses.service` 5, `billing-requests.service` 5, `quotes.service` 4, `invoices.service` 4, `opportunities.service` 3, `customers.service` 3, `nora-routing.service` 1, `returns.service` 1, `reports.service` 1.

- [ ] **Step 3: Convertir los `require()` a imports**

Patrón único en 4 archivos (mantiene los type aliases locales intactos — el `as unknown as` preserva exactamente el tipado actual):

`auth.service.ts` líneas 24-26 — reemplazar por:

```ts
import bcryptPkg from "bcryptjs";
import jsonwebtokenPkg from "jsonwebtoken";
import crypto from "crypto";

const bcrypt = bcryptPkg as unknown as BcryptModule;
const jsonwebtoken = jsonwebtokenPkg as unknown as JsonWebTokenModule;
```

(borrar las 3 líneas `require`, mantener `type BcryptModule` y `type JsonWebTokenModule`; el import de `crypto` sube al bloque de imports superior; call sites `crypto.*` quedan igual.)

`jwt.strategy.ts` línea 14 — reemplazar por:

```ts
import jsonwebtokenPkg from "jsonwebtoken";

const jsonwebtoken = jsonwebtokenPkg as unknown as JsonWebTokenModule;
```

`users.service.ts` línea 14:

```ts
import bcryptPkg from "bcryptjs";

const bcrypt = bcryptPkg as unknown as BcryptModule;
```

`apps/api/prisma/seed.ts` línea 7:

```ts
import bcryptPkg from "bcryptjs";

const bcrypt = bcryptPkg as unknown as BcryptModule;
```

Esto también dispara los `no-unsafe-*` que cascadeaban desde `require() -> any` en `auth.service.ts` (~21 errores).

- [ ] **Step 4: Correr lint de api y aplicar recipes por regla**

```bash
pnpm exec eslint apps/api
```

Recipes (con conteos del sondeo):

| Regla | Cant. | Fix |
|---|---|---|
| `no-unused-vars` | 12 | Quitar specifier de import (o `_` prefijo en args). Archivos: `seed.ts:1`, `create-company.dto.ts:1`, `invoices.service.ts:453` (param `customerId` → `_customerId`), `create-order-item.dto.ts:1`, `products.service.ts:183`, `create-quote-item.dto.ts:1,1`, `create-quote.dto.ts:6,9`, `reports.controller.ts:37`, `reports.service.ts:179`, `complete-visit.dto.ts:2` |
| `no-unnecessary-type-assertion` | 9 | Borrar el ` as X` señalado. `analytics.controller.ts:27` (`row[key] as number` — ya está estrechado por `typeof`), `commercial-expense-extraction.provider.ts:171,176`, `quotes.service.ts:195` (`customer as unknown as PricingCustomer` → dejar solo `customer`), `nora-agent.controller.ts:27,47`, `nora-expense-execution.service.ts:82`, `nora-routing.service.ts:577`, `whatsapp.service.ts:872` |
| `no-empty-object-type` | 3 | `commercial-expense-extraction.provider.ts:153,161,168`: en los 3 tipos de retorno, `Pick<...> | {}` → `Pick<...> | Record<string, never>` (`return {};` sigue compilando) |
| `prefer-const` | 1 | `credit.service.ts:162`: `let purchaseProgress` → `const purchaseProgress` |
| `await-thenable` | 1 | `invoices.service.ts:329`: quitar el `await` de `await this.assertCanRead(...)` (el método es síncrono) |
| `no-redundant-type-constituents` | 1 | `invoices.service.ts:459`: `role: UserRole \| string` → `role: string` |
| `restrict-template-expressions` | 4 | Envolver en `String(...)`: `demo-completed-visit.ts:73`, `notifications.cron.ts:218` (`${String(error)}`), `whatsapp-notifications.cron.ts:105`, `whatsapp.service.ts:1012` |
| `no-base-to-string` | 4 | `import-catalog.ts:23`, `import-customers.ts:56`: en el normalizador `String(v)` con `v: unknown` → cambiar la firma a `v: string` y borrar el cast interno si aplica, o guard: `typeof v === "string" ? v : JSON.stringify(v)`. `analytics.controller.ts:27` y `dashboard.service.ts`: envolver el valor problemático en `String(x)` solo si es primitivo conocido; si puede ser objeto, usar `JSON.stringify`. |
| `no-explicit-any` | 5 | `import-catalog.ts:28,29,296` (×3): tipar los `parse*` como `Record<string, unknown>` / `string` / `number` según uso (los `p1?.sin` de la línea 296-299 deben tiparse para que también caigan los `unsafe-*` del mismo archivo) |
| `no-unsafe-*` residuales | ≈25 | Tras Steps 1-3 quedan ~25 en `auth.controller.ts` (cookies), `service-token.guard.ts` y `import-catalog.ts`. Recipe: castear `any` a forma concreta, p. ej. `const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;` (usar `as unknown as`, NO intersección con `Request` — `Request & {...}` intersecta `cookies: any` y sigue siendo `any`) |

- [ ] **Step 5: Iterar hasta verde de api**

```bash
pnpm exec eslint apps/api
```

Expected: exit 0. Repetir Step 4 hasta lograrlo (el output lista archivo:linea restantes).

- [ ] **Step 6: Verificar tipos y build de api**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
pnpm --filter @norgtech/api build
```

Expected: ambos exit 0. Si `tsc` marca los `as unknown as` de Step 3 o casts de Step 4, ajustar el cast (nunca con `as any` — violaría la regla).

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "chore(lint): baseline de API — helper auditState, imports tipados y fixes type-aware"
```

---

### Task 7: Baseline de Web (400 → 0)

**Files:**
- Modify: ~102 archivos en `apps/web/src` (inventario por regla abajo)
- Modify: `apps/web/src/app/layout.tsx:23`, `feedback-widget.tsx:11`, `order-review-list.tsx:188`, `nora-data-card.tsx:115`, `product-form.tsx:572`, `analytics.ts:107`

- [ ] **Step 1: Correr lint de web y aplicar los 5 recipes masivos**

```bash
pnpm exec eslint apps/web
```

Recipes (responsables de ~350 de los 400):

**R1 — `no-unsafe-assignment`/`-argument`/`-member-access`/`-call`/`-return` por `res.json()` (~265).**
`await res.json()` devuelve `any` y la anotación NO basta (`const x: T = await res.json()` sigue en error — verificado). Fix: cast explícito con el tipo de dominio:

```ts
// antes (agenda/page.tsx:100)
visits = visitsRes.ok ? await visitsRes.json() : [];
// después
visits = (visitsRes.ok ? await visitsRes.json() : []) as Visit[];
```

Tipos de dominio: usar los existentes (`src/lib/*-types.ts`, `components/*/types.ts`); si no hay, definir el shape mínimo inline en el cast. **Nunca `as any`** (dispara `no-explicit-any`). Los sitios de `product-form.tsx:572` (patrón `messageOf`):

```ts
const data = (await response.json().catch(() => ({}))) as { message?: string };
return data.message ?? `No se pudo ${action}.`;
```

**R2 — `no-misused-promises` (64): handlers async en JSX.**

```tsx
// antes
<form onSubmit={handleSubmit}>
<button onClick={handleDelete}>
// después
<form onSubmit={(e) => void handleSubmit(e)}>
<button onClick={() => void handleDelete()}>
```

Si el handler no hace `e.preventDefault()`, añadirlo dentro del handler (verificar por sitio). Grep inicial: `grep -rn "onSubmit={handle\|onClick={handle" apps/web/src`.

**R3 — `no-floating-promises` (4): promesa sin manejar.**

```ts
// antes (customer-goals-section.tsx:129, zones/[id]/page.tsx:25, customer-goals-dashboard.tsx:121, conversation-composer.tsx:70)
loadData();
// después
void loadData();
```

**R4 — `no-base-to-string` (61): `String(formData.get(...))`.**

Helper en `apps/web/src/lib/utils.ts` (junto a `cn`):

```ts
/** Lee un campo de FormData como string; `File` u ausente -> "". */
export function formValue(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}
```

```ts
// antes
const name = String(formData.get("name") ?? "").trim();
// después
const name = formValue(formData, "name").trim();
```

Aplica en todos los `*-form.tsx` (~50 de los 61). Los residuales (`analytics.ts:107`, `nora-data-card`, `login`, etc.): `String(x)` si es primitivo conocido, `JSON.stringify(x)` si puede ser objeto.

**R5 — `no-unused-vars` (13):** quitar specifier sin uso. Archivos: `agenda/page.tsx:1` (`Link`), `analytics/cartera/page.tsx:22` y `analytics/comercial/page.tsx:24` (`param`), `billing-requests/page.tsx:8,68`, `dashboard/page.tsx:22,68`, `invoices/[id]/page.tsx:9`, `invoices/page.tsx:13`, `customer-related-records.tsx:4`, `shift-kpi-card.tsx:22`, `nora-chat.tsx:104`, `nora-data-card.tsx:153`.

- [ ] **Step 2: Fixes puntuales exactos**

`feedback-widget.tsx:11` (`require-await`): quitar `async` del callback — el cuerpo no tiene `await`:

```tsx
onSubmit={(formData) => {
```

`order-review-list.tsx:188` (`exhaustive-deps`): agregar `blocked, ready` al array y actualizar el comentario:

```ts
  }, [orders, tab, search, company, seller, sort, blocked, ready]);
```

`product-form.tsx` (`unsafe-return`, ya cubierto en R1), `sonner.tsx:12` (`no-unnecessary-type-assertion`): borrar ` as ToasterProps["theme"]`. Mismo fix para las 3 aserciones de `nora-chat.tsx:148,243,290` y `whatsapp-ui.ts:54` (`value as number` → `value`).

`nora-data-card.tsx:115` (`no-explicit-any`):

```tsx
// antes
{data.slice(0, 10).map((item: any, index: number) => (
  <div key={item.id ?? index} ...
// después
{(data as Array<Record<string, unknown>>).slice(0, 10).map((item, index) => (
  <div key={String(item.id ?? index)} ...
```

(`item.id` es `unknown` → `String(...)` para la key; verificar con `tsc` que `getItemPrimaryText(item, index)` acepta `Record<string, unknown>` — si no, ampliar su firma a `unknown`.)

`layout.tsx:23` (`no-page-custom-font`): App Router no tiene `_document`; la hoja de fuentes global en el layout raíz es el patrón correcto. Disable con razón, como ya se hace en `auth-shell.tsx:41`:

```tsx
{/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router: la fuente global vive en el layout raíz, no existe _document */}
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap"
/>
```

- [ ] **Step 3: `react-hooks/set-state-in-effect` (14) — refactor o disable con razón**

Ubicaciones: `theme-provider.tsx:46,58`, `topbar.tsx:68`, `user-management-client.tsx:102,110`, `whatsapp-inbox.tsx:65`, `order-form.tsx:119,152,158`, `order-review-list.tsx:154`, `line-price-resolution.tsx:59`, `seller-goals-drawer.tsx:156`, `customer-goals-section.tsx:129`, `use-pricing-preview.ts:35`.

Criterio: si el `setState` es síncrono al inicio de un effect (reseteo de estado derivado de props/key, hidratación de `localStorage`) → refactor solo si es trivial (p. ej. mover a `key=` en JSX); si no, disable con razón concreta. Ejemplo para `theme-provider.tsx` (hidratación de tema — no se puede leer `localStorage` en render sin error de hydratación):

```tsx
React.useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación de tema: localStorage solo existe en cliente
  setMounted(true);
  ...
```

Aplicar el mismo patrón con la razón específica a cada caso que no se refactorice. Si un disable queda sin dispararse, `reportUnusedDisableDirectives` lo marcará y habrá que quitarlo.

- [ ] **Step 4: Iterar hasta verde de web**

```bash
pnpm exec eslint apps/web
```

Expected: exit 0.

- [ ] **Step 5: Verificar tipos y build de web**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
pnpm --filter @norgtech/web build
```

Expected: ambos exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "chore(lint): baseline de web — casts tipados, handlers void, formValue() y disables documentados"
```

---

### Task 8: Verificación integral

- [ ] **Step 1: Lint completo en verde**

```bash
pnpm lint
```

Expected: exit 0, `0 errores, 0 warnings` (sin problemas listados).

- [ ] **Step 2: Typecheck + build completos**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
pnpm build
```

Expected: los 3 exit 0.

- [ ] **Step 3: Smoke de tests e2e de api (si hay Postgres disponible)**

```bash
pnpm --filter @norgtech/api test
```

Expected: suites en verde (las fixes de Task 6 cambiaron imports en services usados por estos tests). Si no hay Postgres local, anotarlo como pendiente en el reporte final — los gates de este plan son lint/tsc/build.

- [ ] **Step 4: Commit si quedó algo pendiente**

```bash
git add -A && git status --short
```

Expected: nada staged (los fixes ya se commitearon por tarea). Si hay cambios, commitearlos con `chore(lint): ajustes finales del baseline`.

---

### Task 9: Gate de Dokploy (paso manual en la UI)

**Files:** ninguno en el repo — este cambio se hace en la UI de Dokploy.

- [ ] **Step 1: Reportar el cambio de build command al usuario**

Imprimir al usuario, con estos textos exactos:

> En Dokploy, para cada servicio TypeScript (web y api), agrega `pnpm lint && ` al inicio de tu Build Command actual:
>
> - Si el build es desde la raíz del monorepo: `pnpm lint && pnpm build`
> - Si es por filtro: `pnpm lint && pnpm --filter @norgtech/web build` (igual para api)
>
> Así, si alguien bypasea el hook con `--no-verify`, el deploy falla en lugar de subir código roto a producción.

- [ ] **Step 2: Verificar que el hook bloquea un push con lint roto (opcional, se revierte)**

```bash
echo "// lint-probe" >> apps/web/src/lib/utils.ts && pnpm lint; git checkout apps/web/src/lib/utils.ts
```

Expected: `pnpm lint` exit 1. Luego probar `git push --dry-run origin main`: el hook `pre-push` corre `pnpm lint` y el push se bloquea. Restaurar el archivo (el `git checkout` del comando ya lo hace).

- [ ] **Step 3: Push final (solo cuando el usuario lo pida)**

```bash
git log --oneline -8   # revisar los commits de esta planilla antes de subir
```

Commits esperados: spec, plan, `fix(tests): tipa helpers...`, `chore(lint): baseline de tests...`, `chore(lint): baseline de API...`, `chore(lint): baseline de web...`.

---

## Self-review del plan (post-escritura)

1. **Spec coverage:** config por niveles (Task 2) ✓ · fixes existentes con verificación lint/tsc/build (Tasks 4-8) ✓ · hook pre-push + prepare guardado (Task 3) ✓ · Dokploy build command (Task 9) ✓ · dependencias del spec incluidas (Task 1; `globals` se usa en los overrides de Task 2) ✓ · criterios "0 errores/0 warnings" y "todo en error" (errorsOnly + `--max-warnings=0`) ✓.
2. **Placeholders:** sin TBD; los dos puntos de iteración (Tasks 6 Step 4, 7 Step 1) son bucles con comandos exactos, recipes por regla con conteos y gates — no "añadir manejo de errores".
3. **Consistencia de nombres:** `auditState()` (definido Task 6 Step 1, usado Step 2) · `formValue()` (Task 7 Step 1 R4) · `errorsOnly()` (Task 2) · rutas `../../audit/audit-state` coherentes con la ubicación del archivo.
