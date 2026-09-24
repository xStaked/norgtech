# Spec: ESLint 9 en monorepo (lint + enforcement sin CI)

**Fecha:** 2026-09-24
**Estado:** aprobado

## Contexto

El repo no tiene ningún linter, formatter ni CI. `pnpm lint` en la raíz ejecuta `pnpm -r lint`, cuyo único script real es un `echo` placeholder en `packages/shared` — es un no-op. El despliegue es en VPS con Dokploy: cada push despliega automáticamente, por lo que no existe ninguna barrera entre un commit y producción. La calidad actual del código (typecheck limpio, ~0 `any`, ~0 TODOs) es disciplina del equipo, no enforcement.

**Objetivo:** introducir ESLint 9 (flat config) con type-aware rules en `apps/web` y `apps/api`, dejar la línea base en cero violaciones, y bloquear pushes/deploys con lint fallido.

## Decisiones tomadas

- **Herramienta:** ESLint 9 flat + typescript-eslint (no Biome, no ESLint+Prettier).
- **Alcance:** solo TypeScript (`apps/web`, `apps/api`). `agents/nora` (Python) queda fuera; ruff puede ser un paso futuro.
- **Enforcement:** hook `pre-push` local **y** gate en el build de Dokploy (doble barrera: local antes del push, servidor si se bypassea el hook).
- **Violaciones existentes:** se arreglan todas ahora, antes de activar hook y gate. Sin baseline de excepciones, sin reglas en `warn`.
- **Formato (Prettier):** fuera de alcance.

## Diseño

### 1. Configuración

Un único `eslint.config.mjs` en la raíz del monorepo. Flat config busca hacia arriba desde el cwd, así que ambos packages lo heredan.

- **Base:** `@eslint/js` recommended + `typescript-eslint` `recommendedTypeChecked` con `projectService: true` (lee los `tsconfig` reales de cada app).
- **Override `apps/web/**`:** `@next/eslint-plugin-next` (`core-web-vitals`, normalizado a `error`) + `eslint-plugin-react-hooks` (`flat/recommended-latest`, React 19).
- **Override `apps/api/**`:** solo las reglas TS base. Sin plugin NestJS por ahora.
- **Tests** (`apps/api/test/**`, `apps/web/tests/**`, `**/*.test.ts`): quedan solo en la base `recommended` (sin type-aware) — ver sección 2.
- **`ignores` globales:** `dist/`, `.next/`, `node_modules/`, `coverage/`, `playwright-report/`, `.pnpm-store/`, `.worktrees/`, `.pytest_cache/`, `docs/`, `agents/`, `packages/shared/`, y `*.js`/`*.mjs`/`*.cjs`/`*.sql` (los únicos `.mjs` trackeados son `postcss.config.mjs` y este config).

### 2. Política de reglas (dos niveles)

- **Código fuente** (`apps/api/src`, `apps/api/prisma`, `apps/web/src`, configs de app): `recommendedTypeChecked` completo — type-aware. Aquí están las reglas de valor real (`no-misused-promises`, `no-floating-promises`, `no-base-to-string`, `no-unsafe-*`).
- **Tests** (`apps/api/test`, `apps/web/tests`, `*.test.ts`): `recommended` **sin** type-aware. El type-aware en e2e se ahoga en `res.json()` → `any` (2.200 falsos positivos de estilo, 0 bugs reales). Además `@typescript-eslint/no-explicit-any: off` para tests (decisión del dueño: los `any` de e2e son aceptables; se justifica en un comentario en la config).
- Todo en nivel `error` (los `warn` de los plugins se normalizan a `error`); los scripts usan `--max-warnings=0`. Cero warnings = el hook y Dokploy bloquean cualquier cosa.
- Excepciones documentadas en la config: `@typescript-eslint/no-unused-vars` acepta args `^_`; `@next/next/no-html-link-for-pages: off` (no aplica en App Router y solo imprime ruido en stderr).
- Sin reglas de estilo subjetivas (naming, orden de imports, formatting).

### 3. Arreglo del código existente

Sondeo con la config final sobre el repo: **610 problemas (572 errores + 38 avisos)** — no los "pocos" estimados inicialmente; el desglose real es:

| Zona | Problemas | Reglas dominantes |
|---|---|---|
| `apps/web/src` | 400 | `no-unsafe-assignment` 145 (`res.json()` sin tipar), `no-misused-promises` 64 (`onSubmit` async), `no-base-to-string` 61 (`String(formData.get())`), `set-state-in-effect` 14 |
| `apps/api` src+prisma | 161 | `no-unsafe-assignment` 76 (scripts de import Excel), `no-unused-vars` 12, `no-require-imports` 6 |
| `apps/api/test` | 49 | 38 comentarios `eslint-disable` obsoletos (`no-var`/`no-var-requires` de un setup legado) + 9 vars sin uso + 2 `require` |
| `apps/web/tests` + `*.test.ts` | 0 | limpio con la config por niveles |

Procedimiento:

1. Correr `eslint . --fix` (elimina los 38 `eslint-disable` obsoletos y los fixes seguros).
2. Arreglar el resto por categoría con recipes deterministas (tipar `res.json()`, `void` en promesas flotantes, convertir `require()` a `import`, quitar imports sin uso) sin cambiar comportamiento.
3. Casos legítimos que la regla no puede resolver (p. ej. `set-state-in-effect` en `theme-provider` para sincronizar el tema) llevan `eslint-disable-next-line` **con razón escrita** — excepción quirúrgica, no regla apagada.
4. **Verificación antes del commit baseline:**
   - `tsc --noEmit` en `apps/api` y `apps/web` → verde (incluye corregir los 5 errores `test.fixtures` de Playwright en `orders.spec.ts`/`reports.spec.ts`).
   - `pnpm build` (Next + Nest) → verde.
   - `pnpm lint` → 0 errores, 0 warnings.
5. Un solo commit: `chore(lint): baseline de ESLint 9 con type-aware rules`.

### 4. Enforcement

- **Hook pre-push:** `simple-git-hooks` (más liviano que husky) declarado en el `package.json` raíz, con script `prepare` que lo instala en `pnpm install`. Hook `pre-push` → `pnpm lint` completo.
- **Dokploy:** el build command de cada servicio en la UI de Dokploy pasa a `pnpm lint && pnpm build`. Este cambio se hace en la UI de Dokploy, no en el repo; queda documentado como paso manual.
- **Scripts raíz:**
  - `"lint": "eslint . --max-warnings=0"` (reemplaza a `pnpm -r lint`).
  - `"prepare": "simple-git-hooks"`.

### 5. Dependencias nuevas (devDependencies raíz)

`eslint`, `@eslint/js`, `typescript-eslint`, `@next/eslint-plugin-next` (fijado a `16.2.4`, igual que el `next` instalado), `eslint-plugin-react-hooks`, `simple-git-hooks`, `globals`, y `@types/jsonwebtoken` en `apps/api` (jsonwebtoken 9 no trae tipos; necesario para poder convertir los `require()` legados a `import`).

## Fuera de alcance

- Prettier / formatting (diferido para no reescribir 66k LOC en este cambio).
- `agents/nora` (Python) — ruff como paso futuro.
- `packages/shared` (paquete muerto, su script `lint` placeholder se ignora).
- Plugin NestJS y reglas de estilo subjetivas.
- Unit tests, README, secretos/credentials (temas separados).

## Criterios de aceptación

1. `pnpm lint` en la raíz ejecuta ESLint real y termina en 0 errores / 0 warnings.
2. Ambas apps (`web`, `api`) pasan `tsc --noEmit` y `pnpm build` después de los fixes.
3. `pnpm install` instala el hook `pre-push` que ejecuta `pnpm lint`.
4. El build command de Dokploy documentado incluye `pnpm lint` antes de `pnpm build`.
5. Ninguna regla está en nivel `warn`.
