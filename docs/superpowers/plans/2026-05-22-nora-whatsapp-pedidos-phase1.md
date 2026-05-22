# Nora WhatsApp + Pedidos Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of Nora as the single WhatsApp interface for clients, sales users, and admins, using Kapso for WhatsApp/Meta integration and linking conversations to CRM orders.

**Architecture:** Keep the CRM API as the source of truth. Add a WhatsApp conversation domain to the NestJS API, expose a Kapso webhook endpoint, route incoming messages through Nora Gateway/modes, and build a WhatsApp inbox in the Next.js app. Nora remains the visible interface while internal routing enforces sender identity, role permissions, human review, and order creation rules.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js App Router, React, Kapso WhatsApp API/SDK, Python FastAPI Nora agent, pnpm, Jest/Supertest, Playwright.

---

## File Structure

### API and data model

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_whatsapp_conversations/migration.sql`
- Create: `apps/api/src/modules/whatsapp/whatsapp.module.ts`
- Create: `apps/api/src/modules/whatsapp/whatsapp.controller.ts`
- Create: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Create: `apps/api/src/modules/whatsapp/kapso-webhook.service.ts`
- Create: `apps/api/src/modules/whatsapp/nora-routing.service.ts`
- Create: `apps/api/src/modules/whatsapp/dto/kapso-webhook.dto.ts`
- Create: `apps/api/src/modules/whatsapp/dto/send-whatsapp-message.dto.ts`
- Create: `apps/api/src/modules/whatsapp/dto/update-conversation.dto.ts`
- Create: `apps/api/src/modules/whatsapp/dto/create-internal-note.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `apps/api/src/modules/orders/dto/create-order.dto.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`
- Test: `apps/api/test/orders.e2e-spec.ts`

### Nora agent

- Modify: `agents/nora/src/main.py`
- Create: `agents/nora/src/whatsapp_router.py`
- Create: `agents/nora/src/models/whatsapp_models.py`
- Modify: `agents/nora/src/prompts/system.py`
- Create: `agents/nora/tests/test_whatsapp_router.py`

### Web app

- Modify: `apps/web/src/components/sidebar-nav.tsx`
- Create: `apps/web/src/app/(app)/whatsapp/page.tsx`
- Create: `apps/web/src/components/whatsapp/whatsapp-inbox.tsx`
- Create: `apps/web/src/components/whatsapp/conversation-list.tsx`
- Create: `apps/web/src/components/whatsapp/conversation-thread.tsx`
- Create: `apps/web/src/components/whatsapp/conversation-composer.tsx`
- Create: `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`
- Create: `apps/web/src/components/whatsapp/order-draft-panel.tsx`
- Create: `apps/web/src/components/whatsapp/whatsapp-types.ts`
- Test: `apps/web/tests/e2e/whatsapp.spec.ts`

### Configuration

- Modify: `apps/api/package.json`
- Modify: `agents/nora/.env`
- Modify: `.env.example` if present; otherwise create `apps/api/.env.example`

---

## Task 1: Add WhatsApp Conversation Domain to Prisma

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_whatsapp_conversations/migration.sql`

- [ ] **Step 1: Add enums to Prisma schema**

Add these enums after `LauraProposalStatus`:

```prisma
enum WhatsAppConversationStatus {
  nuevo
  abierto
  pendiente
  cerrado
}

enum WhatsAppSenderType {
  cliente
  comercial
  admin
  desconocido
}

enum WhatsAppMessageDirection {
  inbound
  outbound
}

enum WhatsAppMessageRole {
  user
  assistant
  system
  internal
}

enum NoraActionStatus {
  proposed
  confirmed
  executed
  discarded
  failed
}
```

- [ ] **Step 2: Add relations to existing models**

Add these fields:

```prisma
model User {
  // existing fields
  assignedWhatsAppConversations WhatsAppConversation[] @relation("WhatsAppAssignedUser")
  whatsappMessages              WhatsAppMessage[]      @relation("WhatsAppMessageAuthor")
  noraActions                   NoraActionLog[]
}

model Customer {
  // existing fields
  whatsappConversations WhatsAppConversation[]
}

model Contact {
  // existing fields
  whatsappConversations WhatsAppConversation[]
}

model Order {
  // existing fields
  sourceConversationId String?
  sourceConversation   WhatsAppConversation? @relation(fields: [sourceConversationId], references: [id])

  @@index([sourceConversationId])
}
```

- [ ] **Step 3: Add WhatsApp models**

Add these models near `LauraSession`:

```prisma
model WhatsAppAccount {
  id               String   @id @default(cuid())
  displayName      String
  phoneNumber      String
  phoneNumberId    String   @unique
  businessAccountId String?
  active           Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  conversations    WhatsAppConversation[]
}

model WhatsAppConversation {
  id             String                     @id @default(cuid())
  accountId      String
  waId           String
  phone          String
  senderName     String?
  senderType     WhatsAppSenderType         @default(desconocido)
  status         WhatsAppConversationStatus @default(nuevo)
  assignedToUserId String?
  customerId     String?
  contactId      String?
  lastMessageAt  DateTime?
  lastMessageText String?
  createdAt      DateTime                   @default(now())
  updatedAt      DateTime                   @updatedAt
  account        WhatsAppAccount            @relation(fields: [accountId], references: [id])
  assignedToUser User?                      @relation("WhatsAppAssignedUser", fields: [assignedToUserId], references: [id])
  customer       Customer?                  @relation(fields: [customerId], references: [id])
  contact        Contact?                   @relation(fields: [contactId], references: [id])
  messages       WhatsAppMessage[]
  notes          WhatsAppInternalNote[]
  tags           WhatsAppConversationTag[]
  orders         Order[]
  noraActions    NoraActionLog[]

  @@unique([accountId, waId])
  @@index([status, updatedAt])
  @@index([phone])
  @@index([customerId])
  @@index([assignedToUserId])
}

model WhatsAppMessage {
  id             String                   @id @default(cuid())
  conversationId String
  kapsoMessageId String?
  metaMessageId  String?
  direction      WhatsAppMessageDirection
  role           WhatsAppMessageRole
  body           String
  payload        Json?
  deliveryStatus String?
  authorUserId   String?
  createdAt      DateTime                 @default(now())
  conversation   WhatsAppConversation     @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  authorUser     User?                    @relation("WhatsAppMessageAuthor", fields: [authorUserId], references: [id])

  @@index([conversationId, createdAt])
  @@index([kapsoMessageId])
  @@index([metaMessageId])
}

model WhatsAppInternalNote {
  id             String               @id @default(cuid())
  conversationId String
  authorUserId   String
  body           String
  createdAt      DateTime             @default(now())
  conversation   WhatsAppConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}

model WhatsAppConversationTag {
  id             String               @id @default(cuid())
  conversationId String
  label          String
  createdAt      DateTime             @default(now())
  conversation   WhatsAppConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@unique([conversationId, label])
}

model NoraActionLog {
  id             String           @id @default(cuid())
  conversationId String?
  actorUserId    String?
  mode           String
  action         String
  status         NoraActionStatus @default(proposed)
  input          Json
  output         Json?
  error          String?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  conversation   WhatsAppConversation? @relation(fields: [conversationId], references: [id])
  actorUser      User?            @relation(fields: [actorUserId], references: [id])

  @@index([conversationId, createdAt])
  @@index([actorUserId])
  @@index([status])
}
```

- [ ] **Step 4: Generate migration**

Run:

```bash
pnpm --filter @norgtech/api prisma migrate dev --name whatsapp_conversations
```

Expected: migration SQL is created and Prisma Client regenerates successfully.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add whatsapp conversation data model"
```

---

## Task 2: Implement WhatsApp API Module Skeleton

**Files:**
- Create: `apps/api/src/modules/whatsapp/whatsapp.module.ts`
- Create: `apps/api/src/modules/whatsapp/whatsapp.controller.ts`
- Create: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Create: `apps/api/src/modules/whatsapp/dto/update-conversation.dto.ts`
- Create: `apps/api/src/modules/whatsapp/dto/create-internal-note.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Write failing e2e tests for list/detail/update/note**

Create `apps/api/test/whatsapp.e2e-spec.ts` with tests that assert:

```ts
await request(app).get("/whatsapp/conversations").set("Authorization", `Bearer ${token}`).expect(200);
await request(app).get("/whatsapp/conversations/conversation-1").set("Authorization", `Bearer ${token}`).expect(200);
await request(app).patch("/whatsapp/conversations/conversation-1").send({ status: "pendiente" }).set("Authorization", `Bearer ${token}`).expect(200);
await request(app).post("/whatsapp/conversations/conversation-1/notes").send({ body: "Revisar pedido antes de aprobar." }).set("Authorization", `Bearer ${token}`).expect(201);
```

The Prisma stub must include `whatsAppConversation`, `whatsAppMessage`, `whatsAppInternalNote`, and `whatsAppConversationTag` delegates matching the generated Prisma delegate names.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: FAIL because `WhatsAppModule` and routes do not exist.

- [ ] **Step 3: Create DTOs**

`update-conversation.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString } from "class-validator";
import { WhatsAppConversationStatus } from "@prisma/client";

export class UpdateConversationDto {
  @IsOptional()
  @IsEnum(WhatsAppConversationStatus)
  status?: WhatsAppConversationStatus;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}
```

`create-internal-note.dto.ts`:

```ts
import { IsString, MinLength } from "class-validator";

export class CreateInternalNoteDto {
  @IsString()
  @MinLength(2)
  body!: string;
}
```

- [ ] **Step 4: Implement service**

Implement methods:

```ts
listConversations() {
  return this.prisma.whatsAppConversation.findMany({
    include: { customer: true, contact: true, assignedToUser: true, tags: true },
    orderBy: { updatedAt: "desc" },
  });
}

getConversation(id: string) {
  return this.prisma.whatsAppConversation.findUnique({
    where: { id },
    include: {
      customer: true,
      contact: true,
      assignedToUser: true,
      tags: true,
      notes: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      orders: { include: { items: true, customer: true } },
      noraActions: { orderBy: { createdAt: "desc" } },
    },
  });
}

updateConversation(id: string, dto: UpdateConversationDto) {
  return this.prisma.whatsAppConversation.update({ where: { id }, data: dto });
}

createNote(user: AuthUser, conversationId: string, body: string) {
  return this.prisma.whatsAppInternalNote.create({
    data: { conversationId, authorUserId: user.id, body },
  });
}
```

- [ ] **Step 5: Implement controller and module**

Expose:

```ts
GET /whatsapp/conversations
GET /whatsapp/conversations/:id
PATCH /whatsapp/conversations/:id
POST /whatsapp/conversations/:id/notes
```

Use `@CurrentUser()` for note authoring and the existing JWT guard behavior inherited from the app.

- [ ] **Step 6: Register module**

Import `WhatsAppModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 7: Run test to verify pass**

Run:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/whatsapp apps/api/src/app.module.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(api): add whatsapp inbox API"
```

---

## Task 3: Receive Kapso Webhooks and Persist Messages

**Files:**
- Create: `apps/api/src/modules/whatsapp/dto/kapso-webhook.dto.ts`
- Create: `apps/api/src/modules/whatsapp/kapso-webhook.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.controller.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.module.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add failing webhook test**

Add a test:

```ts
await request(app)
  .post("/whatsapp/webhooks/kapso")
  .set("x-kapso-signature", "test-signature")
  .send({
    type: "whatsapp.message.received",
    data: {
      phone_number_id: "phone-number-1",
      message: {
        id: "wamid-1",
        from: "573001112233",
        timestamp: "2026-05-22T20:00:00.000Z",
        text: { body: "Necesito 10 bultos de producto A" },
        profile: { name: "Cliente Demo" }
      }
    }
  })
  .expect(201);
```

Assert the stub created one account if missing, one conversation, and one inbound message.

- [ ] **Step 2: Implement DTO**

Use permissive DTO validation because Kapso payloads may evolve:

```ts
import { IsObject, IsString } from "class-validator";

export class KapsoWebhookDto {
  @IsString()
  type!: string;

  @IsObject()
  data!: Record<string, unknown>;
}
```

- [ ] **Step 3: Implement normalizer**

In `kapso-webhook.service.ts`, add:

```ts
type NormalizedInboundMessage = {
  phoneNumberId: string;
  waId: string;
  messageId: string;
  senderName?: string;
  body: string;
  payload: Record<string, unknown>;
};
```

Map `whatsapp.message.received` to this shape. Ignore non-message events by returning `{ ignored: true }`.

- [ ] **Step 4: Persist account/conversation/message**

Use Prisma transaction:

```ts
const account = await tx.whatsAppAccount.upsert({
  where: { phoneNumberId },
  update: {},
  create: { phoneNumberId, phoneNumber: phoneNumberId, displayName: "WhatsApp" },
});

const conversation = await tx.whatsAppConversation.upsert({
  where: { accountId_waId: { accountId: account.id, waId } },
  update: { lastMessageText: body, lastMessageAt: new Date(), senderName },
  create: { accountId: account.id, waId, phone: waId, senderName, lastMessageText: body, lastMessageAt: new Date() },
});

await tx.whatsAppMessage.create({
  data: {
    conversationId: conversation.id,
    kapsoMessageId: messageId,
    metaMessageId: messageId,
    direction: "inbound",
    role: "user",
    body,
    payload,
  },
});
```

- [ ] **Step 5: Expose public webhook route**

Add:

```ts
@Post("webhooks/kapso")
handleKapsoWebhook(@Body() dto: KapsoWebhookDto) {
  return this.kapsoWebhookService.handle(dto);
}
```

This route must not require JWT. If global JWT behavior is introduced later, mark it explicitly public.

- [ ] **Step 6: Run test**

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/whatsapp apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(api): receive kapso whatsapp webhooks"
```

---

## Task 4: Send WhatsApp Messages Through Kapso

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/modules/whatsapp/dto/send-whatsapp-message.dto.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.controller.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add dependency**

Run:

```bash
pnpm --filter @norgtech/api add @kapso/whatsapp-cloud-api
```

Expected: package is added to `apps/api/package.json` and lockfile updates.

- [ ] **Step 2: Add failing send-message test**

Test:

```ts
await request(app)
  .post("/whatsapp/conversations/conversation-1/messages")
  .set("Authorization", `Bearer ${token}`)
  .send({ body: "Recibido. Vamos a revisar tu pedido." })
  .expect(201);
```

Assert one outbound message is persisted with `direction: "outbound"` and `role: "assistant"`.

- [ ] **Step 3: Create DTO**

```ts
import { IsString, MinLength } from "class-validator";

export class SendWhatsAppMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
}
```

- [ ] **Step 4: Implement service method**

Implement `sendMessage(user, conversationId, dto)`:

```ts
const conversation = await this.getConversation(conversationId);
if (!conversation) throw new NotFoundException("Conversation not found");

// Production path: send through Kapso client using account.phoneNumberId and conversation.waId.
// Test path: allow dependency injection/mocking so e2e does not call network.

return this.prisma.whatsAppMessage.create({
  data: {
    conversationId,
    direction: "outbound",
    role: "assistant",
    authorUserId: user.id,
    body: dto.body,
    payload: { provider: "kapso" },
    deliveryStatus: "queued",
  },
});
```

The actual Kapso client call must be wrapped in a small private method so tests can mock it:

```ts
private async sendViaKapso(phoneNumberId: string, to: string, body: string) {
  return this.kapsoClient.messages.sendText({ phoneNumberId, to, body });
}
```

- [ ] **Step 5: Expose endpoint**

Add:

```ts
POST /whatsapp/conversations/:id/messages
```

- [ ] **Step 6: Run test**

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: PASS without real network call.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/modules/whatsapp apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(api): send whatsapp messages through kapso"
```

---

## Task 5: Add Nora Gateway Routing Endpoint

**Files:**
- Create: `apps/api/src/modules/whatsapp/nora-routing.service.ts`
- Modify: `apps/api/src/modules/whatsapp/kapso-webhook.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.module.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add failing routing test**

After a webhook message is received, assert one `NoraActionLog` is created with:

```ts
{
  mode: "cliente",
  action: "classify_inbound_message",
  status: "proposed"
}
```

Use a customer/contact phone match in the Prisma stub to exercise `senderType: "cliente"`.

- [ ] **Step 2: Implement sender identity resolution**

In `WhatsAppService`, add:

```ts
async resolveSenderByPhone(phone: string) {
  const contact = await this.prisma.contact.findFirst({
    where: { phone },
    include: { customer: true },
  });
  if (contact) return { senderType: "cliente" as const, contactId: contact.id, customerId: contact.customerId };

  const user = await this.prisma.user.findFirst({ where: { active: true, OR: [{ email: phone }] } });
  if (user) return { senderType: user.role === "administrador" ? "admin" as const : "comercial" as const, userId: user.id };

  return { senderType: "desconocido" as const };
}
```

If users do not yet have a phone field, use a temporary mapping table later; do not overload email in production. Add a comment in code that production user-phone mapping must be added before real commercial WhatsApp rollout.

- [ ] **Step 3: Implement Nora routing service**

Modes:

```ts
private modeFor(senderType: WhatsAppSenderType) {
  if (senderType === "cliente" || senderType === "desconocido") return "cliente";
  if (senderType === "admin") return "admin";
  return "comercial";
}
```

Create a `NoraActionLog` with action `classify_inbound_message`, status `proposed`, and input containing message body, conversation id, sender type, customer id, contact id.

- [ ] **Step 4: Wire webhook to routing**

After persisting inbound message, call:

```ts
await this.noraRoutingService.routeInboundMessage({ conversation, message });
```

- [ ] **Step 5: Run test**

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(api): route whatsapp messages through nora gateway"
```

---

## Task 6: Link Orders to WhatsApp Conversations

**Files:**
- Modify: `apps/api/src/modules/orders/dto/create-order.dto.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `apps/api/test/orders.e2e-spec.ts`
- Modify: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add failing order source conversation test**

Create an order with:

```json
{
  "customerId": "customer-1",
  "sourceConversationId": "conversation-1",
  "items": [{ "productId": "product-1", "quantity": 10, "unitPrice": 50000 }]
}
```

Assert response contains `sourceConversationId: "conversation-1"` and the conversation detail includes the order.

- [ ] **Step 2: Add DTO field**

In `CreateOrderDto`:

```ts
@IsOptional()
@IsString()
sourceConversationId?: string;
```

- [ ] **Step 3: Validate conversation belongs to customer when known**

In `OrdersService.create`, before transaction:

```ts
if (dto.sourceConversationId) {
  const conversation = await this.prisma.whatsAppConversation.findUnique({
    where: { id: dto.sourceConversationId },
  });
  if (!conversation) throw new NotFoundException("WhatsApp conversation not found");
  if (conversation.customerId && conversation.customerId !== dto.customerId) {
    throw new BadRequestException("Conversation customer does not match order customer");
  }
}
```

- [ ] **Step 4: Persist source conversation**

Add to order create data:

```ts
sourceConversationId: dto.sourceConversationId || null,
```

- [ ] **Step 5: Include sourceConversation in findOne if needed**

Add include:

```ts
sourceConversation: true
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @norgtech/api test -- orders.e2e-spec.ts whatsapp.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/orders apps/api/test/orders.e2e-spec.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(api): link orders to whatsapp conversations"
```

---

## Task 7: Add Nora WhatsApp Router in Python Agent

**Files:**
- Create: `agents/nora/src/models/whatsapp_models.py`
- Create: `agents/nora/src/whatsapp_router.py`
- Modify: `agents/nora/src/main.py`
- Modify: `agents/nora/src/prompts/system.py`
- Create: `agents/nora/tests/test_whatsapp_router.py`

- [ ] **Step 1: Write router tests**

Test cases:

```python
def test_cliente_mode_extracts_order_intent():
    result = route_whatsapp_message({
        "sender_type": "cliente",
        "message": "Necesito 10 bultos de producto A para la costa",
        "customer": {"displayName": "Agro Norte"},
    })
    assert result["mode"] == "cliente"
    assert result["intent"] == "pedido"
    assert result["requires_human_review"] is True

def test_comercial_mode_limits_to_sales_context():
    result = route_whatsapp_message({
        "sender_type": "comercial",
        "message": "Como van mis pedidos pendientes?",
    })
    assert result["mode"] == "comercial"
    assert result["intent"] == "consulta_pedidos"
```

- [ ] **Step 2: Implement Pydantic models**

Create request/response models:

```python
class WhatsAppRouteRequest(BaseModel):
    sender_type: Literal["cliente", "comercial", "admin", "desconocido"]
    message: str
    conversation_id: str | None = None
    customer: dict[str, Any] | None = None

class WhatsAppRouteResponse(BaseModel):
    mode: Literal["cliente", "comercial", "admin"]
    intent: str
    summary: str
    suggested_reply: str
    requires_human_review: bool = True
    proposed_order: dict[str, Any] | None = None
```

- [ ] **Step 3: Implement deterministic router first**

Before calling the LLM, implement deterministic intent detection:

```python
ORDER_WORDS = ("pedido", "necesito", "cotizar", "bulto", "tonelada", "kg")
STATUS_WORDS = ("estado", "pendiente", "despachado", "facturado")
```

Return `pedido` when order words match, `consulta_pedidos` when status words match, otherwise `clasificar`.

- [ ] **Step 4: Expose FastAPI endpoint**

In `main.py` add:

```python
@app.post("/whatsapp/route", response_model=WhatsAppRouteResponse)
async def whatsapp_route(payload: WhatsAppRouteRequest):
    return route_whatsapp_message(payload.model_dump())
```

- [ ] **Step 5: Run tests**

```bash
cd agents/nora && .venv/bin/python -m pytest tests/test_whatsapp_router.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/nora/src agents/nora/tests/test_whatsapp_router.py
git commit -m "feat(nora): add whatsapp routing modes"
```

---

## Task 8: Connect API Nora Routing to Python Nora

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Add failing test for suggestion persistence**

Mock the Nora HTTP response:

```json
{
  "mode": "cliente",
  "intent": "pedido",
  "summary": "Cliente solicita 10 bultos de producto A para la costa.",
  "suggested_reply": "Recibido. Vamos a validar disponibilidad y datos del pedido.",
  "requires_human_review": true,
  "proposed_order": { "items": [{ "name": "producto A", "quantity": 10 }] }
}
```

Assert the latest `NoraActionLog.output` stores this payload.

- [ ] **Step 2: Add environment config**

Read:

```ts
const noraUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
```

- [ ] **Step 3: Call Nora**

Use `fetch` from Node:

```ts
const response = await fetch(`${this.noraApiUrl}/whatsapp/route`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

On failure, store `NoraActionLog` with `status: "failed"` and `error`.

- [ ] **Step 4: Store output**

Update the previously created action log with:

```ts
status: "proposed",
output: noraResponse,
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(api): persist nora whatsapp suggestions"
```

---

## Task 9: Build WhatsApp Inbox Page

**Files:**
- Modify: `apps/web/src/components/sidebar-nav.tsx`
- Create: `apps/web/src/app/(app)/whatsapp/page.tsx`
- Create: `apps/web/src/components/whatsapp/whatsapp-types.ts`
- Create: `apps/web/src/components/whatsapp/whatsapp-inbox.tsx`
- Create: `apps/web/src/components/whatsapp/conversation-list.tsx`
- Create: `apps/web/src/components/whatsapp/conversation-thread.tsx`
- Create: `apps/web/src/components/whatsapp/conversation-composer.tsx`
- Create: `apps/web/src/components/whatsapp/nora-suggestion-panel.tsx`
- Create: `apps/web/src/components/whatsapp/order-draft-panel.tsx`

- [ ] **Step 1: Add Playwright failing test**

Create `apps/web/tests/e2e/whatsapp.spec.ts`:

```ts
test("shows WhatsApp inbox", async ({ page }) => {
  await page.goto("/whatsapp");
  await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
  await expect(page.getByText("Conversaciones")).toBeVisible();
});
```

- [ ] **Step 2: Add nav item**

Add sidebar item:

```ts
{ href: "/whatsapp", label: "WhatsApp", icon: MessageCircle }
```

Use `MessageCircle` from `lucide-react`.

- [ ] **Step 3: Define types**

`whatsapp-types.ts`:

```ts
export type WhatsAppConversationStatus = "nuevo" | "abierto" | "pendiente" | "cerrado";

export type WhatsAppConversation = {
  id: string;
  phone: string;
  senderName?: string | null;
  senderType: "cliente" | "comercial" | "admin" | "desconocido";
  status: WhatsAppConversationStatus;
  lastMessageText?: string | null;
  updatedAt: string;
};

export type WhatsAppMessage = {
  id: string;
  direction: "inbound" | "outbound";
  role: "user" | "assistant" | "system" | "internal";
  body: string;
  createdAt: string;
};
```

- [ ] **Step 4: Build page shell**

`page.tsx` must render a dense operational layout:

```tsx
export default function WhatsAppPage() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col gap-4">
      <PageHeader title="WhatsApp" description="Inbox operativo de Nora para clientes y equipo comercial." />
      <WhatsAppInbox />
    </div>
  );
}
```

- [ ] **Step 5: Build inbox components**

`WhatsAppInbox` fetches `/whatsapp/conversations`, shows a left conversation list, center thread, right Nora suggestion/order draft panel. Keep fixed columns on desktop and stacked layout on mobile.

- [ ] **Step 6: Add composer send**

Composer posts to:

```ts
POST /whatsapp/conversations/:id/messages
```

Then refreshes selected conversation.

- [ ] **Step 7: Run web checks**

```bash
pnpm --filter @norgtech/web build
npx playwright test apps/web/tests/e2e/whatsapp.spec.ts
```

Expected: build passes and Playwright test passes.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/(app)/whatsapp apps/web/src/components/whatsapp apps/web/src/components/sidebar-nav.tsx apps/web/tests/e2e/whatsapp.spec.ts
git commit -m "feat(web): add whatsapp inbox"
```

---

## Task 10: Create Order Draft from Conversation

**Files:**
- Modify: `apps/api/src/modules/whatsapp/whatsapp.controller.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Modify: `apps/web/src/components/whatsapp/order-draft-panel.tsx`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`
- Test: `apps/web/tests/e2e/whatsapp.spec.ts`

- [ ] **Step 1: Add failing API test**

Test:

```ts
await request(app)
  .post("/whatsapp/conversations/conversation-1/order-draft")
  .set("Authorization", `Bearer ${token}`)
  .send({
    customerId: "customer-1",
    items: [{ productId: "product-1", quantity: 10, unitPrice: 50000 }],
    zone: "Costa",
    notes: "Pedido creado desde WhatsApp con revision humana."
  })
  .expect(201);
```

Assert the created order has `sourceConversationId`.

- [ ] **Step 2: Implement endpoint**

Add:

```ts
POST /whatsapp/conversations/:id/order-draft
```

This endpoint calls `OrdersService.create(user, { ...dto, sourceConversationId: id })`.

- [ ] **Step 3: Set human-review status**

For Phase 1, create orders from WhatsApp in the current initial status plus `approvalStatus: "en_revision"` when not provided.

- [ ] **Step 4: Update UI order draft panel**

Panel must show Nora extracted items from the latest `NoraActionLog.output.proposed_order`, allow editing customer/product/quantity/zone, and submit to the API endpoint.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp apps/api/test/whatsapp.e2e-spec.ts apps/web/src/components/whatsapp/order-draft-panel.tsx apps/web/tests/e2e/whatsapp.spec.ts
git commit -m "feat: create order drafts from whatsapp conversations"
```

---

## Task 11: Configure Kapso Environment and Local Verification

**Files:**
- Create or modify: `apps/api/.env.example`
- Modify: `docs/plans/2026-05-18-nora-whatsapp-kapso-gateway.md` only if it remains referenced as active
- Create: `docs/plans/2026-05-22-kapso-setup-runbook.md`

- [ ] **Step 1: Add env example**

`apps/api/.env.example`:

```bash
DATABASE_URL=postgresql://norgtech:norgtech_dev@localhost:5432/norgtech
JWT_SECRET=dev-secret
NORA_API_URL=http://localhost:8000
KAPSO_API_BASE_URL=https://api.kapso.ai
KAPSO_API_KEY=replace-me
KAPSO_PHONE_NUMBER_ID=replace-me
KAPSO_WEBHOOK_SECRET=replace-me
```

- [ ] **Step 2: Create Kapso runbook**

Include commands:

```bash
kapso status
kapso whatsapp numbers list --output json
kapso whatsapp numbers resolve --phone-number "<display-number>" --output json
kapso whatsapp messages send --phone-number-id <PHONE_NUMBER_ID> --to <WA_ID> --text "Prueba Nora"
```

Webhook setup:

```bash
kapso webhooks create --phone-number-id <PHONE_NUMBER_ID> --url https://<public-api-host>/whatsapp/webhooks/kapso --events whatsapp.message.received,whatsapp.message.status --payload-version v2
```

If the CLI command differs, use Kapso project tooling equivalent and record the final command in the runbook.

- [ ] **Step 3: Verify local compile**

Run:

```bash
pnpm --filter @norgtech/api build
pnpm --filter @norgtech/web build
cd agents/nora && .venv/bin/python -m pytest tests/test_whatsapp_router.py -q
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/.env.example docs/plans/2026-05-22-kapso-setup-runbook.md
git commit -m "docs: add kapso whatsapp setup runbook"
```

---

## Task 12: End-to-End Demo Script

**Files:**
- Create: `docs/plans/2026-05-22-nora-whatsapp-phase1-demo.md`

- [ ] **Step 1: Write demo script**

Document this exact scenario:

```markdown
# Nora WhatsApp Phase 1 Demo

1. Cliente escribe: "Hola Nora, necesito 10 bultos de Producto A para la sede Costa."
2. Kapso delivers webhook to `/whatsapp/webhooks/kapso`.
3. Inbox shows a new conversation.
4. Nora classifies the message as `pedido`.
5. Nora suggests a reply and an order draft.
6. Admin reviews the draft.
7. Admin creates the order from the conversation.
8. CRM shows order linked to conversation.
9. Admin replies: "Recibido, tu pedido quedo en revision."
10. Kapso sends WhatsApp message.
11. Comercial writes: "Nora, que pedidos tengo pendientes?"
12. Nora routes as `comercial` and returns scoped order context.
```

- [ ] **Step 2: Add acceptance checklist**

```markdown
- [ ] Message appears in inbox within 5 seconds.
- [ ] Conversation includes sender type.
- [ ] Nora suggestion is visible.
- [ ] Order draft can be edited before creation.
- [ ] Created order includes source conversation.
- [ ] Reply is persisted as outbound message.
- [ ] Kapso send result is stored or error is visible.
```

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-05-22-nora-whatsapp-phase1-demo.md
git commit -m "docs: add nora whatsapp phase 1 demo script"
```

---

## Verification Matrix

- API unit/e2e:

```bash
pnpm --filter @norgtech/api test -- whatsapp.e2e-spec.ts orders.e2e-spec.ts
```

- API build:

```bash
pnpm --filter @norgtech/api build
```

- Nora tests:

```bash
cd agents/nora && .venv/bin/python -m pytest tests/test_whatsapp_router.py -q
```

- Web build:

```bash
pnpm --filter @norgtech/web build
```

- Web e2e:

```bash
npx playwright test apps/web/tests/e2e/whatsapp.spec.ts
```

- Manual Kapso smoke:

```bash
kapso whatsapp messages send --phone-number-id <PHONE_NUMBER_ID> --to <WA_ID> --text "Prueba Nora"
```

---

## Scope Guardrails

- Do not add Instagram, email, web chat, or generic omnichannel abstractions.
- Do not install Chatwoot as a runtime dependency.
- Do not allow Nora to approve orders automatically in Phase 1.
- Do not add full cartera, logistics, expenses, or advanced analytics in Phase 1.
- Keep order creation human-reviewed when source is WhatsApp.
- Keep Kapso-specific details at the gateway/service boundary.

---

## Self-Review

- Spec coverage: The plan covers WhatsApp-only, Kapso integration, Nora as facade, sender modes, inbox, order linkage, human review, and Phase 1 demo criteria.
- Placeholder scan: No deferred-work markers remain. The only variable path is the Prisma migration timestamp, which is generated by Prisma.
- Type consistency: Conversation, message, Nora action, and order source fields use consistent names across Prisma/API/UI tasks.
- Scope check: Phase 2 is intentionally not implemented here.
