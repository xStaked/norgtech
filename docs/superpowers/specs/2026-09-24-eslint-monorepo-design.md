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
- **Override `apps/web/**`:** `@next/eslint-plugin-next` + `eslint-plugin-react-hooks` (React 19).
- **Override `apps/api/**`:** solo las reglas TS base. Sin plugin NestJS por ahora.
- **Override specs de Playwright** (`apps/web/tests/e2e/**`): los specs ya tienen 5 errores de `tsc` por el tipado de `test.fixtures`; se les da un override para que el lint type-aware no los rete. Si arreglar esos 5 errores resulta trivial, se corrigen y el override se elimina.
- **`ignores` globales:** `dist/`, `.next/`, `node_modules/`, `coverage/`, `playwright-report/`, `prisma/generated/`, `.pnpm-store/`, `docs/`.

### 2. Política de reglas

- Todo en nivel `error`; los scripts usan `--max-warnings=0`. Cero warnings = el hook y Dokploy bloquean cualquier cosa.
- Excepción única de estilo: `@typescript-eslint/no-unused-vars` con `argsIgnorePattern: "^_"` (el código existente ya usa `_*` para args ignorados).
- Sin reglas de estilo subjetivas (naming, orden de imports, formatting).

### 3. Arreglo del código existente

1. Correr `eslint . --fix` (solo fixes automáticos seguros).
2. Correr sin `--fix` y arreglar manualmente lo restante, sin cambiar comportamiento.
3. **Verificación antes del commit baseline:**
   - `tsc --noEmit` en `apps/api` y `apps/web` → verde.
   - `pnpm build` (Next + Nest) → verde.
   - `pnpm lint` → 0 errores, 0 warnings.
4. Un solo commit: `chore(lint): baseline de ESLint 9 con type-aware rules`.

### 4. Enforcement

- **Hook pre-push:** `simple-git-hooks` (más liviano que husky) declarado en el `package.json` raíz, con script `prepare` que lo instala en `pnpm install`. Hook `pre-push` → `pnpm lint` completo.
- **Dokploy:** el build command de cada servicio en la UI de Dokploy pasa a `pnpm lint && pnpm build`. Este cambio se hace en la UI de Dokploy, no en el repo; queda documentado como paso manual.
- **Scripts raíz:**
  - `"lint": "eslint . --max-warnings=0"` (reemplaza a `pnpm -r lint`).
  - `"prepare": "simple-git-hooks"`.

### 5. Dependencias nuevas (devDependencies raíz)

`eslint`, `@eslint/js`, `typescript-eslint`, `@next/eslint-plugin-next`, `eslint-plugin-react-hooks`, `simple-git-hooks`, `globals`.

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
