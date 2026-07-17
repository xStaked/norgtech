# Sesión y Refresh Token — Design Spec

**Date:** 2026-07-16
**Status:** Draft
**Feature:** P0.2 · Branch `fix/qa-p0-seguridad-dinero`
**Cierra:** AUTH-01 (no redirige a login al vencer el token), AUTH-02 (no hay refresh token)

---

## 1. Overview

Estado actual (verificado en código):

- `apps/api/src/modules/auth/auth.service.ts` → `login()` emite **solo** un `accessToken` con `expiresIn: "1h"`. **No existe refresh token.**
- `auth.controller.ts` expone `POST /auth/login` y `GET /auth/me`. No hay `POST /auth/refresh`.
- `jwt.strategy.ts` → al vencer/ser inválido el token lanza `UnauthorizedException("Invalid token")` (401).
- Frontend: cuando llega ese 401, la app **no reacciona** (ni renueva ni redirige) — el usuario queda en una pantalla que falla en silencio (screenshots del QA: dashboard con "Error al cargar los clientes" y `Invalid token` en la red).

Objetivo: sesión que se renueva sola mientras el usuario está activo y, cuando ya no puede renovarse, lo lleva limpio al login.

### Decisiones de diseño

| Decisión | Valor (por defecto) |
|----------|---------------------|
| Mecanismo | **Refresh token** de larga duración + access token corto |
| TTL access token | 15 min (hoy 1h; se acorta porque ahora hay refresh) |
| TTL refresh token | 7 días |
| Almacenamiento refresh token | Cookie `httpOnly` `SameSite=Lax` (no accesible a JS) *(alternativa: persistir en tabla para poder revocar — ver §6)* |
| Rotación | Sí: cada refresh emite un nuevo par y revoca el anterior |
| Trigger de refresh en front | Interceptor: ante `401` con `Invalid token`, intenta 1 refresh y reintenta la petición original |
| Al fallar el refresh | Limpiar sesión y `redirect('/login')` |

### Fuera de scope

- SSO / OAuth.
- Múltiples sesiones concurrentes con gestión de dispositivos (más allá de rotación básica).
- "Recuérdame" configurable por el usuario.

---

## 2. Data Model

Opción por defecto (cookie httpOnly firmada, **sin** tabla): no requiere cambios de schema.

Opción con revocación (recomendada si se quiere poder cerrar sesiones): agregar tabla

```prisma
model RefreshToken {
  id         String   @id @default(cuid())
  userId     String
  tokenHash  String   @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

*(Decidir en el primer task; el resto del spec asume la opción con tabla por ser la más robusta y testeable.)*

---

## 3. API Layer

### 3.1 `AuthService`

```typescript
async login(email, password) {
  // ...validación actual...
  const accessToken = this.signAccess(user);        // expiresIn 15m
  const refreshToken = await this.issueRefresh(user); // random, hash guardado
  return { accessToken, refreshToken, user: {...} };
}

async refresh(rawRefreshToken: string) {
  const record = await this.findValidRefresh(rawRefreshToken); // no revocado, no vencido
  if (!record) throw new UnauthorizedException("Sesión expirada");
  await this.revoke(record.id);                      // rotación
  const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
  if (!user || !user.active) throw new UnauthorizedException("Sesión expirada");
  return { accessToken: this.signAccess(user), refreshToken: await this.issueRefresh(user) };
}

async logout(rawRefreshToken: string) { await this.revokeByToken(rawRefreshToken); }
```

`signAccess` = el `jsonwebtoken.sign` actual con `expiresIn: "15m"`.

### 3.2 `AuthController`

```typescript
@Post("login")   // setea cookie refresh httpOnly + devuelve accessToken
@Post("refresh") // lee cookie refresh → nuevo accessToken (+ rota cookie)
@Post("logout")  // revoca refresh + limpia cookie
@Get("me")       // sin cambios
```

`main.ts` ya inicializa Nest; agregar `cookie-parser` si se usa cookie.

---

## 4. Frontend

### 4.1 Interceptor único (`apps/web/src/lib`)

En el cliente HTTP (el `fetch`/axios wrapper que hoy usan los server/client components):

```
respuesta 401 con "Invalid token":
  if (ya se reintentó) → limpiar sesión + redirect('/login')
  else:
    POST /auth/refresh  (cookie httpOnly viaja sola)
    ├─ ok  → guardar nuevo accessToken → reintentar la request original una vez
    └─ falla → limpiar sesión + redirect('/login')   ← cierra AUTH-01
```

Un solo refresh en vuelo a la vez (mutex/promesa compartida) para evitar tormenta de refresh en peticiones paralelas.

### 4.2 Redirect a login

Al fallar el refresh: borrar el accessToken en memoria/estado, y `router.replace('/login?expired=1')`. La página de login puede mostrar "Tu sesión expiró, ingresa de nuevo".

---

## 5. Validation Flow

```
Access token vence a los 15 min
  Petición → 401 "Invalid token"
  Interceptor → POST /auth/refresh (cookie válida 7d)
    ├─ refresh vigente → nuevo access + nuevo refresh (rotado) → request reintenta → OK (transparente)
    └─ refresh vencido/revocado → redirect /login   ← AUTH-01
```

---

## 6. Edge Cases & Error Handling

| Caso | Comportamiento |
|------|----------------|
| Varias peticiones 401 simultáneas | Un solo refresh compartido; las demás esperan su resultado |
| Refresh reusado (robo) | Rotación: el anterior queda revocado; reuso → 401 → login |
| Usuario desactivado mientras tiene sesión | `refresh` valida `user.active`; si no, 401 |
| Logout | Revoca refresh y limpia cookie |
| Cookie bloqueada / SPA sin cookies | Fallback: si no hay refresh disponible, comportarse como AUTH-01 (redirect limpio) |
| Reloj desincronizado | TTLs holgados (15m/7d) absorben skew menor |

---

## 7. Testing Checklist

### API (e2e)

- [ ] `login` devuelve accessToken + setea cookie refresh.
- [ ] `refresh` con cookie válida → nuevo accessToken; el refresh viejo queda revocado (reuso → 401).
- [ ] `refresh` con token vencido/revocado → 401 "Sesión expirada".
- [ ] `refresh` de usuario desactivado → 401.
- [ ] `logout` revoca el refresh.

### Frontend (Playwright)

- [ ] Con access token vencido pero refresh válido, una acción del usuario se completa sin mandarlo al login (refresh transparente).
- [ ] Con refresh inválido, cualquier petición protegida redirige a `/login`.
- [ ] No hay bucle de refresh con peticiones paralelas.
