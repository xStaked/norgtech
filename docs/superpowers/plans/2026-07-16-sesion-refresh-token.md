# Sesión y Refresh Token — Implementation Plan

**Date:** 2026-07-16
**Spec:** `docs/superpowers/specs/2026-07-16-sesion-refresh-token-design.md`
**Branch:** `fix/qa-p0-seguridad-dinero`
**Merge base:** TBD (`git merge-base main fix/qa-p0-seguridad-dinero`)

**Cierra:** AUTH-01 (no redirige a login al vencer el token), AUTH-02 (no existe refresh token).

## Comandos de test

| Capa | Comando |
|------|---------|
| Unit API | `cd apps/api && npx jest` |
| e2e API | `cd apps/api && npx jest --config test/jest-e2e.json` |
| Front (Playwright) | `cd apps/web && npx playwright test` |

## Decisiones asumidas (confirmadas contra código real)

- **Cookie vs tabla → las dos, con roles distintos.** Se implementa la **opción con tabla `RefreshToken`** (§2 del spec, "recomendada") para poder **revocar y rotar** de forma verificable en e2e. El *raw refresh token* viaja al navegador en un cookie **`refresh_token` httpOnly `SameSite=Lax`**; en la BD solo se guarda su `tokenHash` (SHA-256). El **access token sigue viviendo en el cookie existente `session_token`** (no-httpOnly), que hoy leen tanto `getSessionTokenClient()` (`apps/web/src/lib/auth.ts:29-33`) como los server components vía `getSessionToken()` (`apps/web/src/lib/auth.server.ts:7-9`). Así el refresh transparente solo reescribe `session_token` y **no toca** el resto de la app.
- **El string `"Invalid token"` es contrato.** `jwt.strategy.ts:24,28` lanza `UnauthorizedException("Invalid token")` en 401; el interceptor del front se dispara exactamente con ese mensaje. **No se cambia** ese texto.
- **Cross-origin real.** Web corre en `:3000` y API en `:3001` (`NEXT_PUBLIC_API_URL ?? "http://localhost:3001"`, `api.client.ts:3`). El cookie httpOnly lo setea la API para su propio host, así que el front debe llamar `POST /auth/refresh` con `credentials: "include"` y la API debe habilitar CORS con `credentials: true` + `origin` explícito. Ver Riesgos.

---

## Task 1 — Migración Prisma: modelo `RefreshToken`

**Objetivo:** persistir refresh tokens hasheados, con expiración y revocación, ligados a `User`.

**Files**
- `apps/api/prisma/schema.prisma` (modelo `User` en líneas 247-273; se agrega relación + modelo nuevo al final del bloque de modelos).
- `apps/api/prisma/migrations/<timestamp>_add_refresh_token/migration.sql` (generado).
- `apps/api/src/modules/auth/refresh-token.repository.spec.ts` (nuevo, test de contrato del schema vía Prisma).

**Interfaces**
```prisma
model RefreshToken {
  id         String    @id @default(cuid())
  userId     String
  tokenHash  String    @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```
Y en `model User` (tras `sellerGoals` en línea 272) agregar:
```prisma
  refreshTokens RefreshToken[]
```

**Steps**
- [ ] **write failing test:** `refresh-token.repository.spec.ts` que crea un `User`, inserta un `RefreshToken` con `tokenHash` único, verifica que `prisma.refreshToken.create` con `tokenHash` duplicado rechaza (P2002) y que `onDelete: Cascade` borra tokens al borrar el user.
- [ ] **run:** `cd apps/api && npx jest refresh-token.repository.spec.ts` → falla (modelo `refreshToken` no existe en el cliente Prisma).
- [ ] **implement:** editar `schema.prisma` con el modelo y la relación de arriba; correr `cd apps/api && npx prisma migrate dev --name add_refresh_token` (genera SQL + regenera cliente).
- [ ] **run:** `cd apps/api && npx jest refresh-token.repository.spec.ts` → pasa.
- [ ] **commit:** `feat(auth): add RefreshToken model + migration (AUTH-02)`

---

## Task 2 — `AuthService`: emisión, rotación, revocación; access a 15m

**Objetivo:** `signAccess` (15m), `issueRefresh`, `refresh` (rota + revoca), `logout`. `login` pasa a devolver también el raw refresh.

**Files**
- `apps/api/src/modules/auth/auth.service.ts` (login en 25-49; `expiresIn: "1h"` en línea 40; `bcrypt`/`jsonwebtoken` en 18-19; ctor `PrismaService` en 23).
- `apps/api/src/modules/auth/auth.service.spec.ts` (nuevo o extendido).

**Interfaces** (todo en inglés)
```typescript
private signAccess(user: { id: string; role: UserRole; email: string }): string {
  return jsonwebtoken.sign(
    { sub: user.id, role: user.role, email: user.email },
    AUTH_JWT_SECRET,
    { expiresIn: "15m" },           // era "1h" (línea 40)
  );
}

// raw = crypto.randomBytes(32).toString("hex"); en BD solo el hash
private hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async issueRefresh(userId: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
  await this.prisma.refreshToken.create({
    data: { userId, tokenHash: this.hashToken(raw), expiresAt },
  });
  return raw;
}

async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const record = await this.prisma.refreshToken.findUnique({
    where: { tokenHash: this.hashToken(rawRefreshToken) },
  });
  if (!record || record.revokedAt || record.expiresAt <= new Date()) {
    throw new UnauthorizedException("Sesión expirada");
  }
  await this.prisma.refreshToken.update({          // rotación: revoca el usado
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
  if (!user || !user.active) throw new UnauthorizedException("Sesión expirada");
  return { accessToken: this.signAccess(user), refreshToken: await this.issueRefresh(user.id) };
}

async logout(rawRefreshToken: string): Promise<void> {
  await this.prisma.refreshToken.updateMany({
    where: { tokenHash: this.hashToken(rawRefreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```
`login` (líneas 32-48): reemplazar el `jsonwebtoken.sign(... "1h")` por `this.signAccess(user)` y agregar `const refreshToken = await this.issueRefresh(user.id);` devolviéndolo en el objeto. Agregar `const crypto = require("crypto")` junto a los otros require (18-19).

**Steps**
- [ ] **write failing test:** en `auth.service.spec.ts` (mock de `PrismaService`):
  - `login` devuelve `{ accessToken, refreshToken, user }` y el access decodifica con `exp - iat === 900` (15m).
  - `refresh` con record vigente → nuevo par y marca el anterior con `revokedAt` (rotación).
  - `refresh` con `revokedAt != null` o `expiresAt` pasado → `UnauthorizedException("Sesión expirada")`.
  - `refresh` de `user.active === false` → `UnauthorizedException`.
  - `logout` llama `updateMany` con `revokedAt`.
- [ ] **run:** `cd apps/api && npx jest auth.service.spec.ts` → falla.
- [ ] **implement:** editar `auth.service.ts` según Interfaces.
- [ ] **run:** `cd apps/api && npx jest auth.service.spec.ts` → pasa.
- [ ] **commit:** `feat(auth): rotate/revoke refresh tokens, shorten access to 15m (AUTH-02)`

---

## Task 3 — `AuthController` + `main.ts`: endpoints y cookies

**Objetivo:** `POST /auth/refresh`, `POST /auth/logout`; `login` setea cookie httpOnly `refresh_token`; `cookie-parser` en bootstrap.

**Files**
- `apps/api/src/modules/auth/auth.controller.ts` (login 12-24; me 26-30; imports en línea 1).
- `apps/api/src/main.ts` (bootstrap — agregar middleware y CORS con credenciales).
- `apps/api/package.json` (dep `cookie-parser`, dev `@types/cookie-parser`).
- `apps/api/test/auth.e2e-spec.ts` (nuevo; ver Task 6, aquí se crea el esqueleto).

**Interfaces**
```typescript
// helper de cookie reutilizable en login/refresh/logout
private readonly REFRESH_COOKIE = "refresh_token";
private setRefreshCookie(res: Response, raw: string) {
  res.cookie(this.REFRESH_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth",                       // solo se envía a /auth/*
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

@Post("login") @HttpCode(200)
async login(@Body(...) body: LoginDto, @Res({ passthrough: true }) res: Response) {
  const { accessToken, refreshToken, user } = await this.authService.login(body.email, body.password);
  this.setRefreshCookie(res, refreshToken);
  return { accessToken, user };          // el refresh NO va en el body
}

@Post("refresh") @HttpCode(200)
async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
  const raw = req.cookies?.[this.REFRESH_COOKIE];
  if (!raw) throw new UnauthorizedException("Sesión expirada");
  const { accessToken, refreshToken } = await this.authService.refresh(raw);
  this.setRefreshCookie(res, refreshToken);   // rota el cookie
  return { accessToken };
}

@Post("logout") @HttpCode(204)
async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
  const raw = req.cookies?.[this.REFRESH_COOKIE];
  if (raw) await this.authService.logout(raw);
  res.clearCookie(this.REFRESH_COOKIE, { path: "/auth" });
}
```
`main.ts`: `import cookieParser from "cookie-parser";` + `app.use(cookieParser());` y `app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true });`

**Steps**
- [ ] **write failing test:** en `auth.e2e-spec.ts` (Supertest sobre la app Nest real, BD de test):
  - `POST /auth/login` → 200, body `{ accessToken, user }` (sin `refreshToken`), header `Set-Cookie` contiene `refresh_token` con `HttpOnly`.
  - `POST /auth/refresh` reenviando ese cookie → 200 con nuevo `accessToken` y nuevo `Set-Cookie`.
  - `POST /auth/refresh` sin cookie → 401 `"Sesión expirada"`.
- [ ] **run:** `cd apps/api && npx jest --config test/jest-e2e.json auth.e2e-spec.ts` → falla (rutas 404 / cookie ausente).
- [ ] **implement:** instalar `cookie-parser` (`npm i cookie-parser && npm i -D @types/cookie-parser` en `apps/api`), editar `auth.controller.ts` y `main.ts`. Añadir `Req`, `Res` a los imports de `@nestjs/common` y `Request`/`Response` de `express`.
- [ ] **run:** `cd apps/api && npx jest --config test/jest-e2e.json auth.e2e-spec.ts` → pasa.
- [ ] **commit:** `feat(auth): POST /auth/refresh + /auth/logout, httpOnly refresh cookie, cookie-parser + CORS creds`

---

## Task 4 — Frontend: interceptor único con mutex (cierra AUTH-01)

**Objetivo:** en el cliente HTTP de browser, ante `401` con `"Invalid token"`: un solo `POST /auth/refresh` compartido (mutex), reintento único de la request original; si falla → limpiar sesión + `redirect('/login?expired=1')`.

**Files**
- `apps/web/src/lib/api.client.ts` (`apiFetchClient` en 5-21; el `fetch` final en 17-20; hoy **no** manda `credentials`).
- `apps/web/src/lib/auth.ts` (`getSessionTokenClient` en 29-33; agregar `setSessionTokenClient` y `clearSessionClient`).
- `apps/web/src/lib/api.client.spec.ts` (nuevo; unit con `fetch`/`document.cookie` mockeados, jsdom).

**Interfaces**
```typescript
// auth.ts — helpers de escritura del cookie no-httpOnly session_token
export function setSessionTokenClient(token: string): void {
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}
export function clearSessionClient(): void {
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; Max-Age=0`;
}

// api.client.ts — mutex a nivel de módulo: un solo refresh en vuelo
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(new URL("/auth/refresh", API_URL).toString(), {
      method: "POST",
      credentials: "include",           // envía el cookie httpOnly refresh_token
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const { accessToken } = (await r.json()) as { accessToken: string };
        setSessionTokenClient(accessToken);
        return accessToken;
      })
      .catch(() => null)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function apiFetchClient(path: string, init?: RequestInit): Promise<Response> {
  const doFetch = (token: string | null) => {
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init?.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(new URL(path, API_URL).toString(), { ...init, headers, credentials: "include" });
  };

  let res = await doFetch(getSessionTokenClient());
  if (res.status !== 401) return res;

  // solo reaccionar al 401 de token; leer el body clonado para no consumirlo
  const msg = await res.clone().text().catch(() => "");
  if (!msg.includes("Invalid token")) return res;

  const newToken = await refreshAccessToken();   // compartido entre peticiones paralelas
  if (!newToken) {
    clearSessionClient();
    window.location.replace("/login?expired=1");  // AUTH-01
    return res;
  }
  return doFetch(newToken);                        // reintento único
}
```
Nota: se usa `window.location.replace` (módulo lib, fuera de React); en componentes que ya usan `useRouter` puede envolverse, pero el redirect duro basta para cerrar AUTH-01.

**Steps**
- [ ] **write failing test:** `api.client.spec.ts` (jsdom):
  1. 401 `"Invalid token"` → llama `/auth/refresh` una vez → guarda nuevo token en cookie → reintenta original con `Authorization` nuevo → devuelve la 2ª respuesta (200).
  2. `/auth/refresh` responde 401 → `clearSessionClient` borra `session_token` y se invoca `location.replace('/login?expired=1')`.
  3. **Sin tormenta:** 3 `apiFetchClient` en paralelo con 401 → `fetch('/auth/refresh')` se llama **una sola vez** (mutex).
  4. 401 con mensaje distinto de `"Invalid token"` → **no** refresca, devuelve el 401 tal cual.
- [ ] **run:** `cd apps/web && npx jest api.client.spec.ts` → falla (aún es el `apiFetchClient` de 21 líneas sin interceptor). *(si el front no tiene Jest configurado, portar estos casos a un spec de Playwright con rutas mockeadas.)*
- [ ] **implement:** editar `auth.ts` (helpers) y `api.client.ts` (interceptor + mutex + `credentials`).
- [ ] **run:** `cd apps/web && npx jest api.client.spec.ts` → pasa.
- [ ] **commit:** `feat(web): single-flight 401 refresh interceptor + clean logout redirect (AUTH-01)`

---

## Task 5 — Verificación end-to-end (API e2e + Playwright)

**Objetivo:** demostrar rotación, revocación, usuario desactivado (API) y refresh transparente + redirect al expirar (front), sin bucles.

**Files**
- `apps/api/test/auth.e2e-spec.ts` (completar sobre el esqueleto de Task 3).
- `apps/web/e2e/session-refresh.spec.ts` (nuevo, Playwright).

**Interfaces / escenarios**

API e2e (`--config test/jest-e2e.json`):
- [ ] **Rotación + reuso:** login → refresh(cookie A) → 200 y da cookie B; reusar cookie A → 401 `"Sesión expirada"` (A quedó `revokedAt`).
- [ ] **Vencido/revocado:** insertar `RefreshToken` con `expiresAt` pasado → refresh → 401.
- [ ] **Usuario desactivado:** login, luego `user.active=false`, refresh con cookie válida → 401.
- [ ] **Logout:** login → logout(cookie) → refresh con esa cookie → 401.

Playwright (`cd apps/web && npx playwright test`):
- [ ] **Refresh transparente:** sesión con access token ya vencido (15m) pero refresh vigente → una acción protegida (p. ej. cargar `/dashboard` → `GET /customers`) se completa **sin** navegar a `/login`; el QA original mostraba "Error al cargar los clientes" — aquí no debe aparecer.
- [ ] **Redirect al expirar:** con refresh inválido/revocado, cualquier petición protegida termina en `/login?expired=1`.
- [ ] **Sin bucle en paralelo:** interceptar red y verificar que N peticiones 401 simultáneas producen **un** `POST /auth/refresh`.

**Steps**
- [ ] **write failing test:** crear ambos specs con los escenarios de arriba.
- [ ] **run:** `cd apps/api && npx jest --config test/jest-e2e.json` y `cd apps/web && npx playwright test` → fallan en los casos aún no cubiertos.
- [ ] **implement:** ajustes finos (helpers de test para "vencer" el access token: firmar uno con `expiresIn: "-1s"` o mockear reloj; seeds de usuario).
- [ ] **run:** ambos suites en verde.
- [ ] **commit:** `test(auth): e2e rotation/revocation/inactive + Playwright transparent refresh & expiry redirect`

---

## Riesgos y notas

- **Cross-site cookie en prod.** `SameSite=Lax` + `path=/auth` funciona en local (`localhost:3000`↔`:3001` son same-site) y en prod si web y API comparten dominio registrable (`app.*` / `api.*`). Si quedan en dominios distintos, el cookie httpOnly requerirá `SameSite=None; Secure` y CORS con `origin` explícito (no `*`) y `credentials:true`. Confirmar topología de despliegue antes de cerrar Task 3.
- **`session_token` no-httpOnly.** El access token sigue expuesto a JS (necesario para que `getSessionTokenClient` y el interceptor lo lean/reescriban). Es access de 15m; el activo sensible (refresh 7d) sí es httpOnly. Aceptable para P0; endurecer luego si se migra a auth 100% httpOnly.
- **Redirect desde `lib`.** Task 4 usa `window.location.replace`; si se prefiere `router.replace` habrá que exponer el interceptor vía hook/provider. El redirect duro cierra AUTH-01 igual.
- **Server components.** El interceptor vive en el path de browser (`api.client.ts`). `api.server.ts` no refresca (no puede setear cookies fuera de una Server Action); si un server component recibe 401, seguirá dependiendo del middleware/redirect. Fuera de scope inmediato de AUTH-01, que es el flujo de cliente.
- **`refresh` string de error.** El front del interceptor NO debe reaccionar al `"Sesión expirada"` del `/auth/refresh` como si fuera reintentable; solo `"Invalid token"` de rutas protegidas dispara refresh.
