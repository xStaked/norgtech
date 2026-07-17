# Unicanal por rol — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rutear al cliente de WhatsApp al *rol* correcto (comercial/tecnico/facturacion/logistica) cuando pide un humano; el rol ve una bandeja compartida con badge de notificación y "Tomar"; admin/director solo supervisan.

**Architecture:** Nora (customer agent) decide el rol y lo devuelve en `handoff.rol`. NestJS asigna `WhatsAppConversation.assignedToRole` (columna nueva) en vez del buzón único `NORA_UNICANAL_USER_ID`. El listado del inbox y el conteo de pendientes se filtran por rol en el servicio; supervisores ven todo. El web deriva el rol del JWT client-side, agrega polling, botón "Tomar" y un badge de pendientes en el sidebar (visible desde el dashboard).

**Tech Stack:** NestJS + Prisma + Postgres (`apps/api`), Next.js App Router (`apps/web`), Python/LangGraph (`agents/nora`). Jest e2e (`apps/api/test/*.e2e-spec.ts`, runner `test/jest-e2e.json`, `--runInBand`). Pytest (`agents/nora`, sin pytest-asyncio).

## Global Constraints

- **Roles agente (atienden):** `comercial`, `tecnico`, `facturacion`, `logistica`. **Roles supervisor (ven todo, no atienden, no reciben ruteo):** `administrador`, `director_comercial`. Enum Prisma `UserRole` exacto: `administrador | director_comercial | comercial | tecnico | facturacion | logistica`.
- **Solo corren tests `*.e2e-spec.ts`** bajo `test/jest-e2e.json`. Un `*.spec.ts` NO corre. Correr API con `--runInBand` (hay un flake pre-existente de aislamiento en corridas paralelas, no relacionado).
- **Nora pytest:** sin `pytest-asyncio`. Tests deterministas sin LLM ni red (se prueban los helpers de parseo, no el grafo).
- **No usar** la DB remota de prod. Los e2e de API usan un Prisma stub (mock), no DB real.
- **No tocar** `agents/nora/.env`.
- **`WhatsAppInternalNote.authorUserId` es obligatorio** (FK a User, `onDelete: Restrict`). Al quitar el buzón único no hay usuario autor → **no se crean notas internas** en la derivación por rol; el motivo queda en `NoraActionLog.output` y el área en `assignedToRole`. Simplificación deliberada.
- Commits en español, estilo del repo. Rama de trabajo: `feat/unicanal-rol`.

---

### Task 1: Columna `assignedToRole` + constantes de rol (API)

**Files:**
- Modify: `apps/api/prisma/schema.prisma:337-368` (modelo `WhatsAppConversation`)
- Create: `apps/api/src/modules/whatsapp/unicanal-roles.ts`
- Migration: `apps/api/prisma/migrations/<timestamp>_whatsapp_assigned_role/`

**Interfaces:**
- Produces: columna `WhatsAppConversation.assignedToRole: UserRole?` + índice `[status, assignedToRole]`. Constantes `UNICANAL_AGENT_ROLES`, `UNICANAL_SUPERVISOR_ROLES`, funciones `isSupervisor(role)`, `isAttendableRole(value): value is UserRole`.

- [ ] **Step 1: Agregar la columna al schema**

En `apps/api/prisma/schema.prisma`, dentro de `model WhatsAppConversation`, agregar el campo después de `assignedToUserId String?` (línea 345):

```prisma
  assignedToUserId String?
  assignedToRole   UserRole?
```

Y agregar el índice junto a los `@@index` existentes del modelo (después de `@@index([assignedToUserId])`, línea 367):

```prisma
  @@index([status, assignedToRole])
```

- [ ] **Step 2: Generar la migración y el client**

Run: `cd apps/api && npx prisma migrate dev --name whatsapp_assigned_role`
Expected: crea `prisma/migrations/<timestamp>_whatsapp_assigned_role/migration.sql` con `ALTER TABLE "WhatsAppConversation" ADD COLUMN "assignedToRole"` y el índice; regenera `@prisma/client`. Sin errores.

- [ ] **Step 3: Crear el archivo de constantes de rol**

Create `apps/api/src/modules/whatsapp/unicanal-roles.ts`:

```ts
import { UserRole } from "@prisma/client";

/** Roles que atienden el unicanal: reciben ruteo, bandeja y notificación. */
export const UNICANAL_AGENT_ROLES: readonly UserRole[] = [
  UserRole.comercial,
  UserRole.tecnico,
  UserRole.facturacion,
  UserRole.logistica,
];

/** Roles que solo supervisan: ven todo, no atienden, no reciben ruteo. */
export const UNICANAL_SUPERVISOR_ROLES: readonly UserRole[] = [
  UserRole.administrador,
  UserRole.director_comercial,
];

export function isSupervisor(role: UserRole): boolean {
  return UNICANAL_SUPERVISOR_ROLES.includes(role);
}

/** `true` si el string es un rol que puede atender el unicanal (valida el `rol` que manda Nora). */
export function isAttendableRole(value: string | null | undefined): value is UserRole {
  return value != null && (UNICANAL_AGENT_ROLES as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Compilar para verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores (la columna existe en el client regenerado, el archivo compila).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/whatsapp/unicanal-roles.ts
git commit -m "feat(unicanal): columna assignedToRole y constantes de rol"
```

---

### Task 2: Nora customer agent — `rol` en la derivación (Python)

**Files:**
- Modify: `agents/nora/src/models/whatsapp_models.py:138-141` (`NoraHandoff`)
- Modify: `agents/nora/src/whatsapp_customer_agent.py` (tool `derivar_a_unicanal`, prompt, `_extract_handoff`)
- Modify: `agents/nora/tests/test_whatsapp_customer_agent.py` (test de parseo)

**Interfaces:**
- Produces: `NoraHandoff` gana `rol: str | None`. El tool `derivar_a_unicanal(motivo, rol)` devuelve `"DERIVADO|{rol}|{motivo}"`. `_extract_handoff` puebla `rol=parts[1]`, `reason=parts[2]`.
- Consumes (por NestJS, Task 3): `WhatsAppAgentResponse.handoff.rol`.

- [ ] **Step 1: Escribir el test de parseo que falla**

En `agents/nora/tests/test_whatsapp_customer_agent.py`, reemplazar el test existente `test_extract_handoff_detects_derivation` por:

```python
def test_extract_handoff_detects_derivation():
    msgs = [ToolMessage(content="DERIVADO|tecnico|el cliente quiere hablar con soporte",
                        tool_call_id="tc_1", name="derivar_a_unicanal")]
    h = _extract_handoff(msgs)
    assert h.needed is True
    assert h.rol == "tecnico"
    assert h.reason == "el cliente quiere hablar con soporte"


def test_extract_handoff_none_when_no_tool():
    h = _extract_handoff([])
    assert h.needed is False
    assert h.rol is None
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd agents/nora && uv run pytest tests/test_whatsapp_customer_agent.py::test_extract_handoff_detects_derivation -q`
Expected: FAIL — `AttributeError: 'NoraHandoff' object has no attribute 'rol'` (o el content viejo `pedido` ya no matchea).

- [ ] **Step 3: Agregar `rol` al modelo**

En `agents/nora/src/models/whatsapp_models.py`, reemplazar `NoraHandoff` (líneas 138-141):

```python
class NoraHandoff(BaseModel):
    needed: bool = False
    reason: str | None = None
    rol: str | None = None
```

- [ ] **Step 4: Actualizar el tool, el prompt y el parseo**

En `agents/nora/src/whatsapp_customer_agent.py`:

(a) Reemplazar el tool `derivar_a_unicanal` (líneas 65-75):

```python
@tool
def derivar_a_unicanal(motivo: str, rol: str) -> str:
    """Deriva la conversación al área humana correcta cuando el cliente necesita
    algo que no puedes resolver con los datos disponibles (reclamo, info faltante,
    hacer/cambiar un pedido, o hablar con un área/persona).

    Args:
        motivo: Frase corta con el motivo de la derivación.
        rol: El área que debe atender. EXACTAMENTE uno de:
            "comercial"  -> ventas, cotizaciones, hablar con su asesor, hacer/cambiar pedidos.
            "tecnico"    -> soporte, instalación, fallas, asistencia técnica.
            "facturacion"-> facturas, pagos, cartera, comprobantes.
            "logistica"  -> entregas, envíos, transporte, dónde está el pedido.
    """
    return f"DERIVADO|{rol}|{motivo}"
```

(b) Reemplazar el párrafo de derivación del prompt (líneas 57-59) por:

```python
Deriva a un humano (usa derivar_a_unicanal) cuando: hay un reclamo/queja/problema,
piden info que NO está en [DATOS DEL CLIENTE], quieren hacer/cambiar un pedido que no
puedes armar, o piden hablar con un área o persona. SIEMPRE pasa el 'rol' del área que
corresponde (comercial, tecnico, facturacion, logistica) y un 'motivo' corto. Si NO
tienes claro a qué área mandarlo, NO derives: pregúntale al cliente con cuál área quiere
hablar (comercial, soporte técnico, facturación o entregas) y espera su respuesta.
```

(c) Reemplazar `_extract_handoff` (líneas 155-163):

```python
def _extract_handoff(messages: list) -> NoraHandoff:
    """Scan in reverse for a derivar_a_unicanal ToolMessage ('DERIVADO|rol|motivo')."""
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage) and msg.name == "derivar_a_unicanal":
            parts = (msg.content or "").split("|", 2)
            if len(parts) == 3 and parts[0] == "DERIVADO":
                return NoraHandoff(needed=True, rol=parts[1] or None, reason=parts[2] or None)
            return NoraHandoff(needed=True)
    return NoraHandoff(needed=False)
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd agents/nora && uv run pytest tests/test_whatsapp_customer_agent.py -q`
Expected: PASS (incluye los dos nuevos y el resto sin romperse).

- [ ] **Step 6: Correr toda la suite de Nora**

Run: `cd agents/nora && uv run pytest -q`
Expected: PASS. Si algún otro test referenciaba `handoff.intent`, actualizarlo a `handoff.rol`.

- [ ] **Step 7: Commit**

```bash
git add agents/nora/src/models/whatsapp_models.py agents/nora/src/whatsapp_customer_agent.py agents/nora/tests/test_whatsapp_customer_agent.py
git commit -m "feat(nora): derivar_a_unicanal rutea por rol (comercial/tecnico/facturacion/logistica)"
```

---

### Task 3: NestJS routing — asignar por rol + short-circuit ampliado (API)

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts` (short-circuit `257-263`; handoff `383-400`; order_case `303-334` y `336-380`; return type `1120-1126`)
- Modify: `apps/api/test/whatsapp.e2e-spec.ts` (test de derivación existente)

**Interfaces:**
- Consumes: `isAttendableRole`, tipo `UserRole` (Task 1); `handoff.rol` (Task 2).
- Produces: al derivar, `WhatsAppConversation` queda con `status="pendiente"`, `assignedToRole=<rol>`, `assignedToUserId=null`. Nora se calla si hay `assignedToRole` **o** `assignedToUserId`.

- [ ] **Step 1: Importar las constantes y ampliar el short-circuit**

En `apps/api/src/modules/whatsapp/nora-routing.service.ts`, agregar el import (junto a los imports del módulo):

```ts
import { isAttendableRole } from "./unicanal-roles";
```

Reemplazar el short-circuit (líneas 257-263):

```ts
      if (
        sender.senderType === WhatsAppSenderType.cliente &&
        (conversation.assignedToRole || conversation.assignedToUserId) &&
        (conversation.status === "pendiente" || conversation.status === "en_gestion")
      ) {
        return;
      }
```

(Verificar que el `conversation` cargado antes en `routeInboundMessage` no use un `select` que excluya `assignedToRole`; al ser escalar, `findUnique` sin `select` lo trae.)

- [ ] **Step 2: Reemplazar la derivación por handoff (líneas 383-400)**

```ts
          if (agentResponse.handoff?.needed) {
            const rol = agentResponse.handoff.rol?.trim();
            if (isAttendableRole(rol)) {
              await this.prisma.whatsAppConversation.update({
                where: { id: conversation.id },
                data: { assignedToRole: rol, status: "pendiente", assignedToUserId: null },
              });
            } else {
              this.logger.warn(
                `Customer handoff sin rol válido (${rol ?? "n/d"}) — no se asigna, Nora re-pregunta`,
              );
            }
          }
```

- [ ] **Step 3: Reemplazar las dos ramas de order_case (buzón único → rol comercial)**

En la rama "no pudo resolver ítems" (líneas 304-319), reemplazar el bloque `const unicanalUserId = ...` / `if (unicanalUserId) { ...update...note... } else { warn }` por:

```ts
              await this.prisma.whatsAppConversation.update({
                where: { id: conversation.id },
                data: { assignedToRole: UserRole.comercial, status: "pendiente", assignedToUserId: null },
              });
```

En la rama "pedido armado" (líneas 351-366), reemplazar el mismo patrón por:

```ts
              await this.prisma.whatsAppConversation.update({
                where: { id: conversation.id },
                data: { assignedToRole: UserRole.comercial, status: "pendiente", assignedToUserId: null },
              });
```

Verificar que `UserRole` ya está importado en el archivo (lo usa el resto del servicio); si no, agregarlo al import de `@prisma/client`. Eliminar cualquier import de `whatsAppInternalNote`-only que quede sin uso (no borrar el modelo; solo dejamos de crear notas acá).

- [ ] **Step 4: Agregar `rol` al tipo de retorno del agente (línea 1124)**

```ts
      handoff: { needed: boolean; reason: string | null; rol: string | null } | null;
```

- [ ] **Step 5: Actualizar el test de derivación existente**

En `apps/api/test/whatsapp.e2e-spec.ts`, localizar el test que hoy verifica la derivación por `NORA_UNICANAL_USER_ID` (busca `assignedToUserId` + `conversationUpdateMock` en el contexto de handoff). Ajustar el mock de `fetch` del agente customer para que devuelva `handoff: { needed: true, rol: "tecnico", reason: "quiere soporte" }`, y cambiar la aserción a:

```ts
    expect(conversationUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conversation-1" },
        data: expect.objectContaining({ assignedToRole: "tecnico", status: "pendiente" }),
      }),
    );
```

Quitar del test cualquier expectativa sobre `internalNoteCreateMock` en la derivación (ya no se crea nota).

- [ ] **Step 6: Correr el e2e de WhatsApp**

Run: `cd apps/api && pnpm test -- --runInBand whatsapp.e2e-spec.ts`
Expected: PASS. Si falla por `internalNoteCreateMock` sin usar, retirar esa aserción del test tocado.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(unicanal): derivar asigna assignedToRole y Nora calla tras ruteo por rol"
```

---

### Task 4: API — listado por rol, tomar, conteo de pendientes, RBAC (API)

**Files:**
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts` (`listConversations`, `getConversation`, + `claimConversation`, `pendingCount`, helper `assertCanAccess`)
- Modify: `apps/api/src/modules/whatsapp/whatsapp.controller.ts` (`@Roles`, endpoints)
- Create: `apps/api/test/whatsapp-unicanal.e2e-spec.ts`

**Interfaces:**
- Consumes: `isSupervisor`, `UNICANAL_*` (Task 1); columna `assignedToRole` (Task 1).
- Produces: `GET /whatsapp/conversations` filtrado por rol; `GET /whatsapp/conversations/pending-count` → `{ count: number }`; `POST /whatsapp/conversations/:id/claim` → conversación tomada. `AuthUser` = `{ id: string; email: string; role: UserRole }`.

- [ ] **Step 1: Escribir el test unitario del servicio (e2e-spec, sin bootear Nest)**

Create `apps/api/test/whatsapp-unicanal.e2e-spec.ts`:

```ts
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { WhatsAppService } from "../src/modules/whatsapp/whatsapp.service";

function makeService(overrides: Record<string, jest.Mock>) {
  const prisma = {
    whatsAppConversation: {
      findMany: overrides.findMany ?? jest.fn(),
      count: overrides.count ?? jest.fn(),
      findUnique: overrides.findUnique ?? jest.fn(),
      update: overrides.update ?? jest.fn(),
    },
  };
  const service = new WhatsAppService(prisma as any, {} as any, {} as any, {} as any);
  return { service, prisma };
}

const agent = { id: "u-tec", email: "t@n.co", role: UserRole.tecnico };
const supervisor = { id: "u-admin", email: "a@n.co", role: UserRole.administrador };

describe("unicanal por rol — WhatsAppService", () => {
  it("agente ve solo su rol", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = makeService({ findMany });
    await service.listConversations(agent as any);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assignedToRole: UserRole.tecnico } }),
    );
  });

  it("supervisor ve todo (where vacío)", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = makeService({ findMany });
    await service.listConversations(supervisor as any);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("pending-count cuenta pendientes sin tomar del rol propio", async () => {
    const count = jest.fn().mockResolvedValue(3);
    const { service } = makeService({ count });
    const res = await service.pendingCount(agent as any);
    expect(count).toHaveBeenCalledWith({
      where: { assignedToRole: UserRole.tecnico, status: "pendiente", assignedToUserId: null },
    });
    expect(res).toEqual({ count: 3 });
  });

  it("pending-count = 0 para supervisor sin consultar", async () => {
    const count = jest.fn();
    const { service } = makeService({ count });
    const res = await service.pendingCount(supervisor as any);
    expect(res).toEqual({ count: 0 });
    expect(count).not.toHaveBeenCalled();
  });

  it("tomar falla si la conversación es de otro rol", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.facturacion, assignedToUserId: null,
    });
    const { service } = makeService({ findUnique });
    await expect(service.claimConversation(agent as any, "c1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("tomar falla si ya la tomó otro", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.tecnico, assignedToUserId: "otro",
    });
    const { service } = makeService({ findUnique });
    await expect(service.claimConversation(agent as any, "c1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("tomar asigna al agente y pasa a en_gestion", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.tecnico, assignedToUserId: null,
    });
    const update = jest.fn().mockResolvedValue({ id: "c1" });
    const { service } = makeService({ findUnique, update });
    await service.claimConversation(agent as any, "c1");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: { assignedToUserId: "u-tec", status: "en_gestion" },
      }),
    );
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd apps/api && pnpm test -- --runInBand whatsapp-unicanal.e2e-spec.ts`
Expected: FAIL — `listConversations` no acepta argumento / `pendingCount`/`claimConversation` no existen.

- [ ] **Step 3: Implementar los métodos en el servicio**

En `apps/api/src/modules/whatsapp/whatsapp.service.ts`:

(a) Agregar imports: `ConflictException`, `ForbiddenException` a la lista de `@nestjs/common` (ya importa `NotFoundException`, etc.); y al final de los imports del módulo:

```ts
import { isSupervisor } from "./unicanal-roles";
```

(b) Reemplazar `listConversations()` (líneas 114-119):

```ts
  listConversations(user: AuthUser) {
    return this.prisma.whatsAppConversation.findMany({
      where: isSupervisor(user.role) ? {} : { assignedToRole: user.role },
      include: conversationSummaryInclude,
      orderBy: { updatedAt: "desc" },
    });
  }
```

(c) Reemplazar `getConversation(id)` (líneas 121-132) para recibir el user y validar acceso:

```ts
  async getConversation(user: AuthUser, id: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      include: conversationDetailInclude,
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    this.assertCanAccess(user, conversation);
    return conversation;
  }

  private assertCanAccess(
    user: AuthUser,
    conversation: { assignedToRole: UserRole | null },
  ) {
    if (isSupervisor(user.role)) return;
    if (conversation.assignedToRole === user.role) return;
    throw new ForbiddenException("No tenés acceso a esta conversación");
  }

  async claimConversation(user: AuthUser, id: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
    });
    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }
    if (!isSupervisor(user.role) && conversation.assignedToRole !== user.role) {
      throw new ForbiddenException("Esta conversación no es de tu área");
    }
    if (conversation.assignedToUserId && conversation.assignedToUserId !== user.id) {
      throw new ConflictException("La conversación ya fue tomada por otro agente");
    }
    return this.prisma.whatsAppConversation.update({
      where: { id },
      data: { assignedToUserId: user.id, status: "en_gestion" },
      include: conversationDetailInclude,
    });
  }

  async pendingCount(user: AuthUser): Promise<{ count: number }> {
    if (isSupervisor(user.role)) {
      return { count: 0 };
    }
    const count = await this.prisma.whatsAppConversation.count({
      where: {
        assignedToRole: user.role,
        status: "pendiente",
        assignedToUserId: null,
      },
    });
    return { count };
  }
```

- [ ] **Step 4: Correr el test — debe pasar**

Run: `cd apps/api && pnpm test -- --runInBand whatsapp-unicanal.e2e-spec.ts`
Expected: PASS (los 7 casos).

- [ ] **Step 5: Actualizar el controller (RBAC + endpoints + user)**

En `apps/api/src/modules/whatsapp/whatsapp.controller.ts`:

(a) Reemplazar el `@Roles(...)` de la clase `WhatsAppController` (línea 45):

```ts
@Roles(
  "administrador",
  "director_comercial",
  "comercial",
  "tecnico",
  "facturacion",
  "logistica",
)
```

(b) Reemplazar `listConversations` y `getConversation` (líneas 49-57), y **declarar `pending-count` ANTES de `:id`** para que no lo capture el param:

```ts
  @Get("conversations")
  listConversations(@CurrentUser() user: AuthUser) {
    return this.whatsAppService.listConversations(user);
  }

  @Get("conversations/pending-count")
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.whatsAppService.pendingCount(user);
  }

  @Get("conversations/:id")
  getConversation(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.whatsAppService.getConversation(user, id);
  }
```

(c) Agregar el endpoint claim (después de `sendMessage`, línea 101):

```ts
  @Post("conversations/:id/claim")
  claimConversation(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.whatsAppService.claimConversation(user, id);
  }
```

- [ ] **Step 6: Compilar y correr todo el e2e de WhatsApp**

Run: `cd apps/api && npx tsc --noEmit && pnpm test -- --runInBand whatsapp`
Expected: compila; `whatsapp.e2e-spec.ts` y `whatsapp-unicanal.e2e-spec.ts` en verde. El test viejo "lists conversations" usa `adminToken` (administrador = supervisor → ve todo), sigue pasando.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp.service.ts apps/api/src/modules/whatsapp/whatsapp.controller.ts apps/api/test/whatsapp-unicanal.e2e-spec.ts
git commit -m "feat(unicanal): listado por rol, tomar conversacion, conteo de pendientes y RBAC"
```

---

### Task 5: Web — RBAC del módulo + tipos (Next.js)

**Files:**
- Modify: `apps/web/src/lib/theme.ts:49` (nav item `/whatsapp`)
- Modify: `apps/web/src/lib/auth.ts:72` (`canAccess` `/whatsapp`)
- Modify: `apps/web/src/components/whatsapp/whatsapp-types.ts:5-17` (tipo `WhatsAppConversation`)

**Interfaces:**
- Produces: `/whatsapp` accesible a los 6 roles en nav y `canAccess`. `WhatsAppConversation` gana `assignedToRole?: string | null`.

- [ ] **Step 1: Abrir el nav a los roles agente**

En `apps/web/src/lib/theme.ts`, reemplazar la línea 49 (requiredRoles del item `/whatsapp`):

```ts
    requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica"] as const,
```

- [ ] **Step 2: Abrir `canAccess` para `/whatsapp`**

En `apps/web/src/lib/auth.ts`, reemplazar la línea 72:

```ts
    "/whatsapp": ["administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica"],
```

- [ ] **Step 3: Agregar `assignedToRole` al tipo**

En `apps/web/src/components/whatsapp/whatsapp-types.ts`, dentro de `WhatsAppConversation` (después de `assignedToUser?...`, línea 15):

```ts
  assignedToUser?: { id: string; name: string } | null;
  assignedToRole?: string | null;
```

- [ ] **Step 4: Typecheck del web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/theme.ts apps/web/src/lib/auth.ts apps/web/src/components/whatsapp/whatsapp-types.ts
git commit -m "feat(unicanal): habilitar modulo WhatsApp a los roles agente en el web"
```

---

### Task 6: Web — Tomar, polling, dueño y badge de notificación (Next.js)

**Files:**
- Modify: `apps/web/src/components/whatsapp/whatsapp-inbox.tsx` (polling, claim, rol)
- Modify: `apps/web/src/components/whatsapp/conversation-list.tsx` (mostrar dueño/área)
- Modify: `apps/web/src/components/sidebar-nav.tsx` (badge de pendientes en item `/whatsapp`)

**Interfaces:**
- Consumes: `GET /whatsapp/conversations/pending-count`, `POST /whatsapp/conversations/:id/claim` (Task 4). `getUserRoleFromToken`, `getSessionTokenClient` de `@/lib/auth`.

- [ ] **Step 1: Inbox — polling + claim + rol**

En `apps/web/src/components/whatsapp/whatsapp-inbox.tsx`:

(a) Agregar imports arriba (junto a los existentes):

```ts
import { getSessionTokenClient, getUserRoleFromToken } from "@/lib/auth";
import { UNICANAL_AGENT_ROLE_SET } from "./whatsapp-ui";
```

(b) Dentro del componente, después de declarar los estados (línea 24), derivar el rol y saber si es agente:

```ts
  const role = getUserRoleFromToken(getSessionTokenClient());
  const isAgent = role != null && UNICANAL_AGENT_ROLE_SET.has(role);
```

(c) Agregar polling: reemplazar el `useEffect` de la línea 44-46 por dos efectos:

```ts
  useEffect(() => {
    loadConversation(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const id = setInterval(() => {
      void refreshList();
    }, 15000);
    return () => clearInterval(id);
  }, []);
```

(d) Agregar la función claim (después de `updateConversationStatus`, línea 80):

```ts
  async function claimConversation(id: string) {
    const response = await apiFetchClient(`/whatsapp/conversations/${id}/claim`, {
      method: "POST",
    });
    if (response.ok) {
      await refreshSelected();
    }
  }
```

(e) Renderizar una barra "Tomar" encima del composer cuando la conversación activa no tiene dueño y el usuario es agente. Reemplazar el bloque del composer (líneas 111-118) por:

```ts
        <div className="flex min-h-0 flex-col">
          <ConversationThread conversation={activeConversation} />
          {isAgent && activeConversation && !activeConversation.assignedToUser ? (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-[#fff7e6] px-4 py-2.5">
              <span className="text-xs font-medium text-[#8a6d1f]">
                Sin asignar — tomala para responder.
              </span>
              <button
                type="button"
                onClick={() => activeConversation && claimConversation(activeConversation.id)}
                className="rounded-md bg-[#0f5c8a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0c4a70]"
              >
                Tomar conversación
              </button>
            </div>
          ) : null}
          <ConversationComposer
            conversationId={selectedId}
            suggestedReply={suggestedReply}
            onSent={refreshSelected}
          />
        </div>
```

- [ ] **Step 2: Exponer el set de roles agente en el web**

En `apps/web/src/components/whatsapp/whatsapp-ui.ts`, agregar al final:

```ts
import type { UserRole } from "@/lib/auth";

/** Roles que atienden el unicanal (espejo de UNICANAL_AGENT_ROLES del API). */
export const UNICANAL_AGENT_ROLE_SET = new Set<UserRole>([
  "comercial",
  "tecnico",
  "facturacion",
  "logistica",
]);
```

- [ ] **Step 3: Lista — mostrar dueño/área**

En `apps/web/src/components/whatsapp/conversation-list.tsx`, dentro del `<button>` de cada conversación, debajo del bloque de `lastMessageText` (después de la línea 109, cierre del `div` de la fila inferior), agregar un renglón chico con el estado de asignación:

```tsx
                  {conversation.assignedToUser ? (
                    <div className="mt-0.5 truncate text-[11px] text-[#167c4a]">
                      Tomada por {conversation.assignedToUser.name}
                    </div>
                  ) : conversation.assignedToRole ? (
                    <div className="mt-0.5 truncate text-[11px] font-semibold text-[#b45309]">
                      Pendiente · {conversation.assignedToRole}
                    </div>
                  ) : null}
```

- [ ] **Step 4: Sidebar — badge de pendientes en el item WhatsApp**

En `apps/web/src/components/sidebar-nav.tsx`:

(a) Agregar imports:

```ts
import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
```

(b) Dentro de `SidebarNav`, después de calcular `visibleGroups` (línea 104), pollear el conteo:

```ts
  const [pending, setPending] = useState(0);
  useEffect(() => {
    let alive = true;
    async function poll() {
      const res = await apiFetchClient("/whatsapp/conversations/pending-count");
      if (alive && res.ok) {
        const data = (await res.json()) as { count: number };
        setPending(data.count);
      }
    }
    void poll();
    const id = setInterval(poll, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
```

(c) Pasar el badge al item de WhatsApp. Cambiar la firma de `SidebarNavItem` para aceptar `badge?: number` y renderizarlo; y en `NavSection`/`SidebarNav` pasar `badge={item.href === "/whatsapp" ? pending : 0}`.

En `SidebarNavItem` (líneas 57-79), agregar el prop y el badge antes del cierre del `<Link>`:

```tsx
function SidebarNavItem({ item, active, badge = 0 }: { item: NavItem; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      className={/* … igual … */}
    >
      <span className={/* … igual (shortLabel) … */}>{item.shortLabel}</span>
      <span className="truncate">{item.label}</span>
      {badge > 0 ? (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
```

`NavSection` recibe `pending` y lo pasa: cambiar su firma a `{ group, pathname, pending }` y en el `.map` `badge={item.href === "/whatsapp" ? pending : 0}`. En `SidebarNav`, donde se renderizan las secciones, pasar `pending={pending}`.

- [ ] **Step 5: Typecheck del web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Verificación manual (stack real)**

Levantar API+web+Nora. Con un usuario `tecnico` y uno `comercial`:
1. Simular derivación a `tecnico` (o forzar en DB `assignedToRole='tecnico', status='pendiente', assignedToUserId=null`).
2. Login como `tecnico`: aparece badge en el item WhatsApp del sidebar; la conversación está en su lista con "Pendiente · tecnico"; botón "Tomar" visible.
3. "Tomar" → pasa a "Tomada por <nombre>", badge baja; el composer envía.
4. Login como `comercial`: NO ve esa conversación. Login como `administrador`: la ve (supervisión) y sin badge.

Expected: los 4 pasos se cumplen.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/whatsapp/whatsapp-inbox.tsx apps/web/src/components/whatsapp/whatsapp-ui.ts apps/web/src/components/whatsapp/conversation-list.tsx apps/web/src/components/sidebar-nav.tsx
git commit -m "feat(unicanal): bandeja por rol con Tomar, polling y badge de pendientes en el sidebar"
```

---

## Notas de cierre

- **`NORA_UNICANAL_USER_ID`** deja de usarse en el path del customer agent. Se puede retirar del `.env` de despliegue una vez mergeado.
- **Flag**: todo esto vive detrás de `NORA_WHATSAPP_CUSTOMER_AGENT=true`. Confirmar que está ON donde se quiera el unicanal.
- **Verificación LLM real** (no cubierta por unit tests): que Nora mande el `rol` correcto por intención y pregunte el área cuando es ambiguo — probar en WhatsApp real.
- **Migración en prod**: `prisma migrate deploy` para la columna `assignedToRole`. Sin backfill: conversaciones viejas quedan `assignedToRole=null` (visibles para supervisores; las que ya tenían `assignedToUserId` conservan dueño).
