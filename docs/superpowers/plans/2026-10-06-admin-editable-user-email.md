# Correo editable en Administración Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un administrador edite el correo de cualquier usuario desde la fila de `/users`, con aviso, revocación de sesiones y auto-logout al cambiar el propio.

**Architecture:** El mismo `PATCH /users/:id` acepta `email` opcional; si el correo normalizado cambió, la escritura y la revocación de `refreshToken` + `passwordResetToken` ocurren en una `$transaction`. El cliente edita el correo en la fila, confirma con `window.confirm` y redirige a `/login` si cambió el propio.

**Tech Stack:** NestJS 11 + Prisma 6.7, Next.js 16, jest e2e (`apps/api/test/jest-e2e.json`), tests web `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-06-admin-editable-user-email-design.md`

## Global Constraints

- Node 22, pnpm 10.32.1 workspaces, TS 5.8 estricto (`npx tsc --noEmit` limpio en cada app tocada).
- Tests API: `pnpm --filter @norgtech/api test -- users.e2e-spec.ts` desde la raíz.
- Tests web puros: `node --test src/components/users/user-mutations.test.ts` desde `apps/web`.
- Lint: `eslint . --max-warnings=0` antes de cada commit (o al menos sobre los archivos tocados).
- TDD: test que falla primero, código mínimo después, commit por tarea.
- UI en español es-CO; no mostrar el mensaje en inglés del API (`Email already exists`).
- Sin migración: `User.email` ya existe y es `@unique`.
- `passwordHash` sigue rechazado por `forbidNonWhitelisted`.

## Review Focus

- Correo que solo cambia en mayúsculas/espacios (`  ADMIN@... `) tratado como sin cambio: no llama al API en el cliente y no revoca nada en el servidor.
- Duplicado insensible a mayúsculas (`ADMIN@NORGTECH.COM` de otro usuario) responde 409 y no modifica al usuario.
- `email: ""` o `email: null` responde 400 y deja el correo intacto (no lo borra ni lo pone null).
- `PATCH { email }` solo no altera `name`, `phone`, `role` ni `active`.
- El 409 de email se muestra como "Ese correo ya lo tiene otra persona.", nunca el inglés del API.

---

### Task 1: API — `email` editable con revocación en transacción

**Files:**
- Modify: `apps/api/src/modules/users/dto/update-user.dto.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`
- Modify: `apps/api/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`user`, `refreshToken`, `passwordResetToken`, `$transaction`); `AuthUser { id: string }`; `publicUserSelect` existente en el spec de test.
- Produces: `PATCH /users/:id` acepta `{ email?: string }` normalizado (trim + lowercase); si cambió, revoca `refreshToken` abiertos (`revokedAt`) e invalida `passwordResetToken` sin usar (`usedAt`) del `userId` en la misma transacción; duplicado → `409 "Email already exists"`; inválido → `400`.

- [ ] **Step 1: Extender el mock del spec con `passwordResetToken` + `$transaction` y escribir los tests que fallan**

  En `apps/api/test/users.e2e-spec.ts`, agregar al `prismaMock`:
  - `passwordResetToken: { updateMany: async () => ({ count: 0 }) }` temporal (luego captura real).
  - `$transaction: async (fn) => fn(prismaMock)` temporal.
  - Contadores `lastRefreshRevokeArgs`, `lastResetInvalidateArgs` (se refinan en el Step 3).

  Agregar estos tests (nombres exactos):
  ```ts
  it("updates another user email, normalizes it, and revokes sessions and reset tokens", ...)
  it("does not revoke sessions when the email is unchanged after normalization", ...)
  it("rejects duplicate emails with 409 and leaves the user untouched", ...)
  it("rejects invalid emails with 400", ...)
  it("rejects null email with 400", ...)
  it("allows an admin to update their own email", ...)
  ```
  Aserciones clave del primero:
  ```ts
  .send({ email: "  NUEVO@norgtech.com " }).expect(200);
  expect(response.body.email).toBe("nuevo@norgtech.com");
  expect(response.body.name).toBe("Comercial"); // otros campos intactos
  expect(lastRefreshRevokeArgs?.where).toMatchObject({ userId: "commercial-id", revokedAt: null });
  expect(lastResetInvalidateArgs?.where).toMatchObject({ userId: "commercial-id", usedAt: null });
  ```
  Del segundo: `.send({ email: "  COMERCIAL@norgtech.com " }).expect(200)` y ambos contadores en `0` / `undefined`.
  Del duplicado: crear `other-id` con `other@norgtech.com`, luego `.send({ email: "OTHER@norgtech.com" }).expect(409)` y `users.get("commercial-id")?.email` intacto.
  Reemplazar el test existente `"rejects patch payloads with email"` (línea ~455): ese comportamiento deja de existir; borrarlo y en su lugar los tests de inválido/nulo esperan `400`.

- [ ] **Step 2: Correr el spec y verificar que falla**

  Run: `pnpm --filter @norgtech/api test -- users.e2e-spec.ts`
  Expected: FAIL — `email` es rechazado con 400 (`forbidNonWhitelisted`) y `$transaction`/`updateMany` no existen en el mock.

- [ ] **Step 3: Implementar `email` en `UpdateUserDto` en `apps/api/src/modules/users/dto/update-user.dto.ts`**

  Firma: `email?: string` opcional, misma validación de formato que el alta.
  ```ts
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsEmail()
  email?: string;
  ```
  Agregar `IsEmail` al import existente de `class-validator`. No tocar `passwordHash` (sigue sin existir en el DTO, luego `forbidNonWhitelisted` lo rechaza).

- [ ] **Step 4: Implementar el cambio de correo en `UsersService.update` en `apps/api/src/modules/users/users.service.ts`**

  Firma existente: `update(currentUser: AuthUser, id: string, dto: UpdateUserDto): Promise<PublicUser>` — no cambia.

  Cambios:
  1. El `findUnique` pasa a `select: { id: true, role: true, email: true }` (se necesita el correo actual para comparar).
  2. Si `dto.email !== undefined`, normalizar con `this.normalizeEmail(dto.email)` y comparar con `existing.email`; si son iguales, tratar como si no viniera (no escribir, no revocar).
  3. Si cambió, ejecutar en `this.prisma.$transaction(async (tx) => ...)`:
     - `tx.user.update({ where: { id }, data: { ...campos, email: normalized }, select: publicUserSelect })`
     - `tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })`
     - `tx.passwordResetToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } })`
  4. Envolver en `try/catch`: si `isUniqueConstraintError(error)` → `ConflictException("Email already exists")`, igual que `create`. El `catch` cubre tanto la vía con transacción como la vía simple.
  5. Mantener las reglas de auto-rol y auto-desactivación sin cambios; el propio correo sí está permitido.

- [ ] **Step 5: Ajustar las expectativas viejas del spec que miran el `select` del `findUnique`**

  En `apps/api/test/users.e2e-spec.ts`, los dos asserts con `select: { id: true, role: true }` (test de update exitoso y test de 404) pasan a `select: { id: true, role: true, email: true }`. El mock `user.findUnique` ya acepta `select` genérico; solo cambia lo esperado.

- [ ] **Step 6: Correr el spec y verificar que pasa**

  Run: `pnpm --filter @norgtech/api test -- users.e2e-spec.ts`
  Expected: PASS — todos los tests viejos (salvo el borrado) más los 6 nuevos.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/api/src/modules/users/dto/update-user.dto.ts apps/api/src/modules/users/users.service.ts apps/api/test/users.e2e-spec.ts
  git commit -m "feat(api): permitir editar el correo con revocacion de sesiones"
  ```

### Task 2: Web — edición del correo en la fila con aviso y auto-logout

**Files:**
- Modify: `apps/web/src/components/users/user-mutations.ts`
- Create: `apps/web/src/components/users/user-mutations.test.ts`
- Modify: `apps/web/src/components/users/user-management-client.tsx`

**Interfaces:**
- Consumes: `PATCH /users/:id` con `{ email }` de la Task 1; `ManagedUser { id, name, email }`; `apiFetchClient`; `clearSessionClient` de `@/lib/auth`; `router` de `next/navigation`.
- Produces: `normalizeEmailInput(value: string) => string`; `isValidEmailInput(value: string) => boolean`; `EMAIL_VALIDATION_MESSAGE: string`; `emailConflictMessage(status: number) => string | null`; fila con campo de correo editable, confirmación y auto-logout propio.

- [ ] **Step 1: Escribir el test puro que falla para los helpers de correo**

  En `apps/web/src/components/users/user-mutations.test.ts` (patrón `node --test`, como `src/lib/route-guards.test.ts`):
  ```ts
  // node --test src/components/users/user-mutations.test.ts
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { normalizeEmailInput, isValidEmailInput, emailConflictMessage } from "./user-mutations.ts";

  test("normaliza trim + minusculas", () => {
    assert.equal(normalizeEmailInput("  NUEVO@Norgtech.COM "), "nuevo@norgtech.com");
  });
  test("rechaza vacio y sin forma de correo", () => {
    assert.equal(isValidEmailInput(""), false);
    assert.equal(isValidEmailInput("sin-arroba"), false);
    assert.equal(isValidEmailInput("a@b"), false);
    assert.equal(isValidEmailInput("a@b.com"), true);
  });
  test("traduce el 409 de email duplicado", () => {
    assert.equal(emailConflictMessage(409), "Ese correo ya lo tiene otra persona.");
    assert.equal(emailConflictMessage(400), null);
  });
  ```

- [ ] **Step 2: Correr el test y verificar que falla**

  Run (desde `apps/web`): `node --test src/components/users/user-mutations.test.ts`
  Expected: FAIL — `normalizeEmailInput` / `isValidEmailInput` / `emailConflictMessage` no existen.

- [ ] **Step 3: Implementar los helpers en `apps/web/src/components/users/user-mutations.ts`**

  Agregar sin tocar lo existente de teléfono:
  ```ts
  export const EMAIL_VALIDATION_MESSAGE = "Escribe un correo válido, por ejemplo nombre@empresa.com";
  export function normalizeEmailInput(value: string): string;
  export function isValidEmailInput(value: string): boolean;
  export function emailConflictMessage(status: number): string | null;
  ```
  - `normalizeEmailInput`: `value.trim().toLowerCase()`.
  - `isValidEmailInput`: se evalúa sobre el valor ya normalizado; `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
  - `emailConflictMessage`: `status === 409` → `"Ese correo ya lo tiene otra persona."`, otro → `null`.

- [ ] **Step 4: Correr el test y verificar que pasa**

  Run (desde `apps/web`): `node --test src/components/users/user-mutations.test.ts`
  Expected: PASS.

- [ ] **Step 5: Implementar la edición del correo en `apps/web/src/components/users/user-management-client.tsx`**

  Cambios mínimos, siguiendo el patrón de `draftPhone` / `handlePhoneBlur`:
  1. Estado: `draftEmail` + `emailError` junto a `draftPhone`; `startEdit` los inicializa (`user.email`, `null`); `cancelEdit` los limpia.
  2. `patchUser`: ampliar el body a `Partial<Pick<ManagedUser, "name" | "phone" | "role" | "active" | "email">>` y traducir el 409 de email: si `response.status === 409` y el body pedía `email`, la descripción del toast es `emailConflictMessage(409)`.
  3. Columna `email`: si la fila está en edición, renderizar `Input type="email"` con `value={draftEmail}`, `onChange` que actualiza y limpia `emailError`, y `onBlur={() => void handleEmailBlur(user)}`; si no, el `span` actual sin cambios.
  4. `handleEmailBlur(user)`:
     - `normalized = normalizeEmailInput(draftEmail)`; si `normalized === user.email.toLowerCase()` → restaurar draft, limpiar error, return (sin API, sin aviso).
     - Si `!normalized || !isValidEmailInput(normalized)` → `setEmailError(EMAIL_VALIDATION_MESSAGE)`, conservar lo escrito, return (sin API, sin aviso).
     - `isSelf = user.id === currentUserId`; mensaje exacto del spec: otra persona → `` `${user.name} tendrá que volver a iniciar sesión con ${normalized}. El correo anterior deja de servir para entrar.` ``; propio → `` `Vas a cambiar tu correo a ${normalized}. Tendrás que volver a iniciar sesión y el correo anterior dejará de servir para entrar.` ``; `if (!window.confirm(msg)) { setDraftEmail(user.email); setEmailError(null); return; }`.
     - `patchUser(user, { email: normalized }, ...)`: éxito → `setDraftEmail(updated.email)`, limpiar error; si `isSelf` → auto-logout del Step 6. Fallo → `setDraftEmail(user.email)` y el toast ya mostrado por `patchUser`.
  5. Acción del menú: `"Editar nombre y teléfono"` → `"Editar datos"`.

- [ ] **Step 6: Implementar el auto-logout al cambiar el propio correo en el mismo archivo**

  Después de un guardado exitoso con `isSelf`:
  ```ts
  try { await apiFetchClient("/auth/logout", { method: "POST" }); }
  finally { clearSessionClient(); router.push("/login"); router.refresh(); }
  ```
  Importar `clearSessionClient` de `@/lib/auth`. El `finally` garantiza la redirección aunque el logout del navegador falle; en el servidor las sesiones ya quedaron revocadas (Task 1).

- [ ] **Step 7: Verificar tipos y tests web**

  Run (desde `apps/web`): `node --test src/components/users/user-mutations.test.ts && npx tsc --noEmit`
  Expected: PASS en ambos, sin errores de tipo.

- [ ] **Step 8: Commit**

  ```bash
  git add apps/web/src/components/users/user-mutations.ts apps/web/src/components/users/user-mutations.test.ts apps/web/src/components/users/user-management-client.tsx
  git commit -m "feat(web): editar correo de usuarios con aviso y auto-logout"
  ```
