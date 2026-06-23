# Corrección de Gastos por WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando un admin pide corrección de un gasto desde el panel, el comercial recibe un WhatsApp con el motivo y puede corregirlo conversando con Nora desde el mismo chat.

**Architecture:** Al pasar un gasto a `requiere_correccion`, el API notifica al comercial por WhatsApp (plantilla aprobada por Meta) y abre un caso Nora tipo `expense` en modo corrección. El routing existente enruta las respuestas al agente Nora, que aplica el cambio con un nuevo tool `update_expense` (reutiliza el `update` existente del servicio de gastos, que ya auto-reenvía `requiere_correccion → pendiente`) y cierra el caso.

**Tech Stack:** NestJS + Prisma (apps/api), LangGraph/Python (agents/nora), Kapso WhatsApp Cloud API (`@kapso/whatsapp-cloud-api@0.2.1`).

## Global Constraints

- **Ventana de 24h de WhatsApp:** la notificación saliente debe enviarse como **plantilla aprobada por Meta** (`correccion_gasto`, idioma `es`), nunca texto libre. El resto de la conversación corre libre una vez el comercial responde.
- **Feature flag:** el routing al agente de gastos solo ocurre con `NORA_WHATSAPP_AGENT_EXPENSES === "true"` (`nora-routing.service.ts:288`). La corrección depende de este flag.
- **Solo campos de texto:** monto, categoría, descripción, proveedor, NIT, número de factura, método de pago, fecha, cliente. Sin re-OCR.
- **Reusar tipo de caso `expense`:** no crear nuevo `NoraConversationCaseType`. El modo corrección se marca en `extractedData.mode = "correction"`.
- **Categorías válidas** (literal, minúsculas, sin tildes): `alimentacion, transporte, hospedaje, combustible, peajes, parqueadero, atencion_comercial, otros`.
- **Degradación limpia:** si el comercial no tiene `phone` o no hay `WhatsAppAccount`, loguear y continuar; el cambio de estado del gasto nunca debe fallar por la notificación.

---

### Task 1: `sendTemplate` en WhatsAppService

Refactor del envío saliente para soportar plantillas además de texto, sin duplicar la lógica de persistencia/estado del mensaje.

**Files:**
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts` (`createAndSendOutboundMessage:161-229`, `sendViaKapso:370-401`)
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `sendTemplateMessage(conversationId: string, templateName: string, languageCode: string, params: Array<{ name: string; text: string }>, previewBody: string): Promise<WhatsAppMessage>`
  - private `sendViaKapsoTemplate(phoneNumberId: string, to: string, templateName: string, languageCode: string, params: Array<{ name: string; text: string }>): Promise<SendMessageResponse | Record<string, unknown>>`

- [ ] **Step 1: Write the failing test**

Añadir a `apps/api/test/whatsapp.e2e-spec.ts` (sigue el patrón de mocks de ese archivo; si no existe un describe de envío, créalo con un PrismaService stub mínimo como en `nora-agent.e2e-spec.ts`):

```ts
describe("WhatsAppService.sendTemplateMessage", () => {
  it("persists an outbound message and dispatches a template via Kapso", async () => {
    process.env.NODE_ENV = "test"; // forces the Kapso mock path
    const created: Record<string, unknown> = {};
    const prisma = {
      whatsAppConversation: {
        findUnique: async () => ({
          id: "conv_1",
          waId: "573001000099",
          account: { phoneNumberId: "pn_1" },
        }),
        update: async () => ({}),
      },
      whatsAppMessage: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(created, { id: "msg_1", ...data });
          return created;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(created, data);
          return created;
        },
      },
    } as unknown as PrismaService;

    const service = new WhatsAppService(prisma, {} as never, {} as never);
    const result = await service.sendTemplateMessage(
      "conv_1",
      "correccion_gasto",
      "es",
      [{ name: "nombre", text: "Carlos" }],
      "Tu gasto requiere corrección.",
    );

    expect(result).toMatchObject({ deliveryStatus: "sent" });
    expect(created.body).toBe("Tu gasto requiere corrección.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json -t "sendTemplateMessage"`
Expected: FAIL (`sendTemplateMessage is not a function`).

- [ ] **Step 3: Refactor outbound persistence into a shared helper + add template path**

En `whatsapp.service.ts`, reemplaza el cuerpo de `createAndSendOutboundMessage` para delegar el envío a un callback, y añade los métodos de plantilla. Importa `WhatsAppMessage` desde `@prisma/client` si no está ya.

```ts
private async createAndSendOutboundMessage(
  conversationId: string,
  body: string,
  authorUserId: string | null,
) {
  return this.persistAndDispatch(conversationId, body, authorUserId, (phoneNumberId, waId) =>
    this.sendViaKapso(phoneNumberId, waId, body),
  );
}

async sendTemplateMessage(
  conversationId: string,
  templateName: string,
  languageCode: string,
  params: Array<{ name: string; text: string }>,
  previewBody: string,
) {
  return this.persistAndDispatch(conversationId, previewBody, null, (phoneNumberId, waId) =>
    this.sendViaKapsoTemplate(phoneNumberId, waId, templateName, languageCode, params),
  );
}

private async persistAndDispatch(
  conversationId: string,
  body: string,
  authorUserId: string | null,
  dispatch: (
    phoneNumberId: string,
    waId: string,
  ) => Promise<SendMessageResponse | Record<string, unknown>>,
) {
  const conversation = await this.prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: sendMessageConversationInclude,
  });

  if (!conversation) {
    throw new NotFoundException("WhatsApp conversation not found");
  }

  const attemptedAt = new Date();
  const message = await this.prisma.whatsAppMessage.create({
    data: {
      conversationId,
      direction: "outbound",
      role: "assistant",
      ...(authorUserId && { authorUserId }),
      body,
      payload: { provider: "kapso" },
      deliveryStatus: "queued",
    },
  });

  await this.prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: { lastMessageText: body, lastMessageAt: attemptedAt },
  });

  try {
    const providerResult = await dispatch(conversation.account.phoneNumberId, conversation.waId);
    return this.prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        deliveryStatus: "sent",
        payload: { provider: "kapso", providerResult: providerResult as Prisma.InputJsonValue },
      },
    });
  } catch (error) {
    const safeError = this.getSafeErrorMessage(error);
    this.logger.error(
      `Kapso send failed for conversation ${conversation.id} (to: ${conversation.waId}): ${safeError}`,
    );
    await this.prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: { deliveryStatus: "failed", payload: { provider: "kapso", error: safeError } },
    });
    throw new BadGatewayException("Could not send WhatsApp message");
  }
}

private async sendViaKapsoTemplate(
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string,
  params: Array<{ name: string; text: string }>,
): Promise<SendMessageResponse | Record<string, unknown>> {
  const kapsoApiKey = process.env.KAPSO_API_KEY;

  if (!kapsoApiKey || process.env.NODE_ENV === "test") {
    return { id: "kapso-test-template", status: "queued", phoneNumberId, to, templateName };
  }

  const client = new WhatsAppClient({
    baseUrl: process.env.KAPSO_API_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp",
    kapsoApiKey,
  });

  return client.messages.sendTemplate({
    phoneNumberId,
    to,
    name: templateName,
    language: { code: languageCode },
    components: [
      {
        type: "body",
        parameters: params.map((p) => ({ type: "text", parameter_name: p.name, text: p.text })),
      },
    ],
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --config test/jest-e2e.json -t "sendTemplateMessage"`
Expected: PASS. Si el typecheck del SDK marca `sendTemplate`, revisa `client.messages.sendTemplate` (firma confirmada en `@kapso/whatsapp-cloud-api` `index.d.ts:726`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(whatsapp): add sendTemplateMessage for outbound template sends"
```

---

### Task 2: `notifyExpenseCorrection` en WhatsAppService

Resuelve el comercial, abre el caso de corrección y envía la plantilla.

**Files:**
- Modify: `apps/api/src/modules/whatsapp/whatsapp.service.ts`
- Test: `apps/api/test/whatsapp.e2e-spec.ts`

**Interfaces:**
- Consumes: `sendTemplateMessage` (Task 1), `NoraCaseService.createCase` (`nora-case.service.ts:33`), `normalizePhone` (private, `whatsapp.service.ts:431`).
- Produces:
  - `notifyExpenseCorrection(expense: ExpenseCorrectionInput): Promise<void>` where
    ```ts
    type ExpenseCorrectionInput = {
      id: string;
      amount: Prisma.Decimal | number;
      category: string;
      expenseDate: Date;
      description: string;
      supplierName: string | null;
      supplierNit: string | null;
      invoiceNumber: string | null;
      paymentMethod: string | null;
      reviewNote: string | null;
      submittedByUserId: string;
      submittedBy: { name: string; phone: string | null } | null;
    };
    ```

**Note:** `WhatsAppService` debe inyectar `NoraCaseService`. Ya están en el mismo módulo (`whatsapp.module.ts`), así que basta agregarlo al constructor.

- [ ] **Step 1: Write the failing test**

```ts
describe("WhatsAppService.notifyExpenseCorrection", () => {
  const baseExpense = {
    id: "exp_1",
    amount: 50000,
    category: "alimentacion",
    expenseDate: new Date("2026-06-20T00:00:00.000Z"),
    description: "Almuerzo",
    supplierName: null,
    supplierNit: null,
    invoiceNumber: null,
    paymentMethod: null,
    reviewNote: "Falta el NIT del proveedor",
    submittedByUserId: "user_1",
    submittedBy: { name: "Carlos", phone: "+573001000099" },
  };

  function build() {
    const account = { id: "acc_1" };
    const conversation = { id: "conv_1", account: { phoneNumberId: "pn_1" } };
    const prisma = {
      whatsAppAccount: { findFirst: jest.fn().mockResolvedValue(account) },
      whatsAppConversation: { upsert: jest.fn().mockResolvedValue(conversation) },
    } as unknown as PrismaService;
    const noraCaseService = { createCase: jest.fn().mockResolvedValue({ id: "case_1" }) };
    const service = new WhatsAppService(prisma, {} as never, {} as never, noraCaseService as never);
    jest.spyOn(service, "sendTemplateMessage").mockResolvedValue({} as never);
    return { service, prisma, noraCaseService };
  }

  it("opens a correction case and sends the template", async () => {
    const { service, noraCaseService } = build();
    await service.notifyExpenseCorrection(baseExpense as never);

    expect(noraCaseService.createCase).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "expense",
        extractedData: expect.objectContaining({
          mode: "correction",
          expenseId: "exp_1",
          reviewNote: "Falta el NIT del proveedor",
        }),
      }),
    );
    expect(service.sendTemplateMessage).toHaveBeenCalledWith(
      "conv_1",
      "correccion_gasto",
      "es",
      expect.arrayContaining([{ name: "motivo", text: "Falta el NIT del proveedor" }]),
      expect.any(String),
    );
  });

  it("skips silently when the comercial has no phone", async () => {
    const { service, noraCaseService } = build();
    await service.notifyExpenseCorrection({ ...baseExpense, submittedBy: { name: "Carlos", phone: null } } as never);
    expect(noraCaseService.createCase).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json -t "notifyExpenseCorrection"`
Expected: FAIL (`notifyExpenseCorrection is not a function` / constructor arity).

- [ ] **Step 3: Inject NoraCaseService and implement the method**

Añade al constructor de `WhatsAppService`:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly ordersService: OrdersService,
  private readonly orderAutomation: WhatsAppOrderAutomationService,
  private readonly noraCaseService: NoraCaseService,
) {}
```

Importa `NoraCaseService`, `NoraConversationCaseType`, `NoraConversationCaseStatus`, `NoraCaseRiskLevel`. Implementa:

```ts
async notifyExpenseCorrection(expense: ExpenseCorrectionInput): Promise<void> {
  const phone = expense.submittedBy?.phone?.trim();
  if (!phone) {
    this.logger.warn(`Expense ${expense.id} correction: submitter has no phone, skipping WhatsApp`);
    return;
  }

  const account = await this.prisma.whatsAppAccount.findFirst();
  if (!account) {
    this.logger.warn(`Expense ${expense.id} correction: no WhatsAppAccount configured, skipping`);
    return;
  }

  const waId = this.normalizePhone(phone);
  // ponytail: single-account assumption — if multiple accounts exist, pick the
  // one tied to this comercial. Documented in the spec risks.
  const conversation = await this.prisma.whatsAppConversation.upsert({
    where: { accountId_waId: { accountId: account.id, waId } },
    update: {},
    create: {
      accountId: account.id,
      waId,
      phone,
      status: "pendiente",
      senderType: WhatsAppSenderType.comercial,
    },
    include: { account: true },
  });

  await this.noraCaseService.createCase({
    conversationId: conversation.id,
    type: NoraConversationCaseType.expense,
    status: NoraConversationCaseStatus.collecting_info,
    extractedData: {
      mode: "correction",
      expenseId: expense.id,
      reviewNote: expense.reviewNote ?? "",
      amount: Number(expense.amount),
      category: expense.category,
      expenseDate: expense.expenseDate.toISOString().slice(0, 10),
      description: expense.description,
      supplierName: expense.supplierName,
      supplierNit: expense.supplierNit,
      invoiceNumber: expense.invoiceNumber,
      paymentMethod: expense.paymentMethod,
    },
    missingFields: [],
    riskLevel: NoraCaseRiskLevel.medium,
    createdByUserId: expense.submittedByUserId,
  });

  const valor = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(expense.amount));

  await this.sendTemplateMessage(
    conversation.id,
    "correccion_gasto",
    "es",
    [
      { name: "nombre", text: expense.submittedBy?.name ?? "comercial" },
      { name: "valor", text: valor },
      { name: "motivo", text: expense.reviewNote ?? "" },
    ],
    `Hola ${expense.submittedBy?.name ?? ""}, tu gasto por ${valor} requiere corrección. Motivo: ${expense.reviewNote ?? ""}. Respóndeme aquí y te ayudo a corregirlo.`,
  );
}
```

Declara el type `ExpenseCorrectionInput` (export) cerca de `ResolvedWhatsAppSender`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --config test/jest-e2e.json -t "notifyExpenseCorrection"`
Expected: PASS (ambos casos).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp.service.ts apps/api/test/whatsapp.e2e-spec.ts
git commit -m "feat(whatsapp): notifyExpenseCorrection opens correction case + sends template"
```

---

### Task 3: Disparar la notificación al pasar a `requiere_correccion`

Inyecta `WhatsAppService` en `CommercialExpensesService` con `forwardRef` (los módulos forman un ciclo) y llama `notifyExpenseCorrection` tras el commit.

**Files:**
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts` (`updateStatus:332-415`, constructor, `commercialExpenseInclude:58-64`)
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`
- Modify: `apps/api/src/modules/whatsapp/whatsapp.module.ts`
- Test: `apps/api/test/commercial-expenses.e2e-spec.ts`

**Interfaces:**
- Consumes: `WhatsAppService.notifyExpenseCorrection` (Task 2).

- [ ] **Step 1: Resolve the circular module dependency with forwardRef**

En `commercial-expenses.module.ts`, importa el módulo de WhatsApp con `forwardRef`:

```ts
import { forwardRef, Module } from "@nestjs/common";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
// ...
@Module({
  imports: [AuthModule, AuditModule, forwardRef(() => WhatsAppModule)],
  // ...
})
```

En `whatsapp.module.ts`, cambia el import directo de `CommercialExpensesModule` a `forwardRef`:

```ts
imports: [AuthModule, forwardRef(() => CommercialExpensesModule), forwardRef(() => OrdersModule)],
```

- [ ] **Step 2: Write the failing test**

Añade a `apps/api/test/commercial-expenses.e2e-spec.ts` un test unitario del servicio (sigue el patrón de construcción directa de servicios; `updateStatus` corre dentro de `$transaction`, así que el stub de prisma debe ejecutar el callback):

```ts
describe("CommercialExpensesService.updateStatus correction notification", () => {
  function build(currentStatus = "pendiente") {
    const expense = {
      id: "exp_1",
      status: currentStatus,
      submittedByUserId: "user_1",
      submittedBy: { id: "user_1", name: "Carlos", phone: "+573001000099" },
      amount: 50000,
      category: "alimentacion",
      expenseDate: new Date("2026-06-20"),
      description: "Almuerzo",
      supplierName: null, supplierNit: null, invoiceNumber: null, paymentMethod: null,
      reviewNote: null,
    };
    const tx = {
      commercialExpense: {
        findUnique: jest.fn().mockResolvedValue(expense),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    // second findUnique (post-update) returns the corrected expense
    tx.commercialExpense.findUnique
      .mockResolvedValueOnce(expense)
      .mockResolvedValueOnce({ ...expense, status: "requiere_correccion", reviewNote: "Falta NIT" });
    const prisma = { $transaction: (fn: (c: typeof tx) => unknown) => fn(tx) } as never;
    const auditService = { record: jest.fn() };
    const whatsapp = { notifyExpenseCorrection: jest.fn().mockResolvedValue(undefined) };
    const service = new CommercialExpensesService(
      prisma, auditService as never, {} as never, {} as never, whatsapp as never,
    );
    (service as any).isControlRole = () => true;
    (service as any).assertCanRead = () => undefined;
    return { service, whatsapp };
  }

  it("notifies WhatsApp when transitioning to requiere_correccion", async () => {
    const { service, whatsapp } = build();
    await service.updateStatus({ id: "admin" } as never, "exp_1", {
      status: "requiere_correccion", reviewNote: "Falta NIT",
    } as never);
    expect(whatsapp.notifyExpenseCorrection).toHaveBeenCalledWith(
      expect.objectContaining({ id: "exp_1", reviewNote: "Falta NIT" }),
    );
  });

  it("does not notify on other transitions", async () => {
    // build() with current status "pendiente"; post-update findUnique returns "aprobado"
    const { service, whatsapp } = build();
    await service.updateStatus({ id: "admin" } as never, "exp_1", { status: "aprobado" } as never)
      .catch(() => undefined);
    expect(whatsapp.notifyExpenseCorrection).not.toHaveBeenCalled();
  });
});
```

> Nota: el constructor de `CommercialExpensesService` gana un 5º parámetro (`whatsAppService`). Ajusta cualquier instanciación directa existente en specs (p. ej. en `nora-agent.e2e-spec.ts` se construye vía `Test.createTestingModule` con providers — agrega el provider mock allí; ver Step 4).

- [ ] **Step 3: Inject WhatsAppService and fire the notification**

En `commercial-expenses.service.ts`:

```ts
import { forwardRef, Inject } from "@nestjs/common";
import { WhatsAppService } from "../whatsapp/whatsapp.service";

constructor(
  private readonly prisma: PrismaService,
  private readonly auditService: AuditService,
  private readonly storageService: R2StorageService,
  private readonly exportService: CommercialExpensesExportService,
  @Inject(forwardRef(() => WhatsAppService))
  private readonly whatsAppService: WhatsAppService,
) {}
```

Asegura que `commercialExpenseInclude` trae el teléfono del submitter — `submittedBy: true` ya incluye `phone` y `name` (campos del modelo User). No requiere cambio.

Al final de `updateStatus`, fuera del `$transaction` (para no notificar si el commit falla), reemplaza el `return this.prisma.$transaction(...)` por:

```ts
const updated = await this.prisma.$transaction(async (tx) => {
  // ... cuerpo existente sin cambios, termina con `return updated;`
});

if (updated.status === CommercialExpenseStatus.requiere_correccion) {
  try {
    await this.whatsAppService.notifyExpenseCorrection({
      id: updated.id,
      amount: updated.amount,
      category: updated.category,
      expenseDate: updated.expenseDate,
      description: updated.description,
      supplierName: updated.supplierName,
      supplierNit: updated.supplierNit,
      invoiceNumber: updated.invoiceNumber,
      paymentMethod: updated.paymentMethod,
      reviewNote: updated.reviewNote,
      submittedByUserId: updated.submittedByUserId,
      submittedBy: updated.submittedBy
        ? { name: updated.submittedBy.name, phone: updated.submittedBy.phone }
        : null,
    });
  } catch (error) {
    // No bloquea el cambio de estado; el comercial igual lo ve en la app.
    this.logger.error(`WhatsApp correction notify failed for ${updated.id}: ${String(error)}`);
  }
}

return updated;
```

Agrega `private readonly logger = new Logger(CommercialExpensesService.name);` e importa `Logger` si no existe.

- [ ] **Step 4: Fix existing service instantiations**

En `apps/api/test/nora-agent.e2e-spec.ts`, en el `Test.createTestingModule` del describe "createFromBuffer" (línea ~86), agrega el provider:

```ts
{ provide: WhatsAppService, useValue: { notifyExpenseCorrection: jest.fn() } },
```

e importa `WhatsAppService`. (Los demás describes que construyen el servicio directamente no llaman `updateStatus`, así que pueden pasar `{} as never` como 5º arg si el compilador lo exige.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest --config test/jest-e2e.json -t "correction notification"`
Run: `cd apps/api && npx jest --config test/jest-e2e.json nora-agent`
Expected: PASS. Verifica también que la app levanta (DI sin ciclos rotos): `cd apps/api && npx jest --config test/jest-e2e.json -t "POST /whatsapp/agent/expenses"`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/commercial-expenses apps/api/src/modules/whatsapp/whatsapp.module.ts apps/api/test
git commit -m "feat(expenses): notify comercial on WhatsApp when expense needs correction"
```

---

### Task 4: Endpoint `PATCH /whatsapp/agent/expenses/:id` + `updateFromWhatsApp`

Permite al agente actualizar el gasto y cerrar el caso. Reutiliza el `update` existente del servicio de gastos, que ya valida permisos del submitter y auto-reenvía `requiere_correccion → pendiente` (`commercial-expenses.service.ts:286-291`).

**Files:**
- Create: `apps/api/src/modules/whatsapp/dto/update-whatsapp-expense.dto.ts`
- Modify: `apps/api/src/modules/whatsapp/nora-expense-execution.service.ts`
- Modify: `apps/api/src/modules/whatsapp/nora-agent.controller.ts`
- Test: `apps/api/test/nora-agent.e2e-spec.ts`

**Interfaces:**
- Consumes: `CommercialExpensesService.update` (`commercial-expenses.service.ts:194`), `NoraCaseService.findOpenCase`/`updateCase`.
- Produces:
  - `NoraExpenseExecutionService.updateFromWhatsApp(input: { user: AuthUser; conversationId: string; expenseId: string; dto: UpdateCommercialExpenseDto }): Promise<{ id: string; status: string }>`
  - `PATCH /whatsapp/agent/expenses/:id` body `UpdateWhatsAppExpenseDto`.

- [ ] **Step 1: Create the DTO**

`apps/api/src/modules/whatsapp/dto/update-whatsapp-expense.dto.ts`:

```ts
import { IsString } from "class-validator";
import { UpdateCommercialExpenseDto } from "../../commercial-expenses/dto/update-commercial-expense.dto";

export class UpdateWhatsAppExpenseDto extends UpdateCommercialExpenseDto {
  @IsString()
  conversationId!: string;
}
```

- [ ] **Step 2: Write the failing test**

Añade a `apps/api/test/nora-agent.e2e-spec.ts`:

```ts
describe("NoraExpenseExecutionService.updateFromWhatsApp", () => {
  it("updates the expense and closes the open case", async () => {
    const noraCaseService = {
      findOpenCase: jest.fn().mockResolvedValue({ id: "case_1" }),
      updateCase: jest.fn().mockResolvedValue(undefined),
    };
    const expensesService = {
      update: jest.fn().mockResolvedValue({ id: "exp_1", status: "pendiente" }),
    };
    const service = new NoraExpenseExecutionService(
      noraCaseService as never, expensesService as never, {} as never, {} as never,
    );

    const result = await service.updateFromWhatsApp({
      user: { id: "user_1" } as never,
      conversationId: "conv_1",
      expenseId: "exp_1",
      dto: { supplierNit: "900123456" } as never,
    });

    expect(expensesService.update).toHaveBeenCalledWith(
      { id: "user_1" }, "exp_1", { supplierNit: "900123456" },
    );
    expect(noraCaseService.updateCase).toHaveBeenCalledWith(
      "case_1",
      expect.objectContaining({
        status: NoraConversationCaseStatus.executed,
        executedEntityType: "CommercialExpense",
        executedEntityId: "exp_1",
      }),
    );
    expect(result).toEqual({ id: "exp_1", status: "pendiente" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json -t "updateFromWhatsApp"`
Expected: FAIL (`updateFromWhatsApp is not a function`).

- [ ] **Step 4: Implement `updateFromWhatsApp`**

En `nora-expense-execution.service.ts` (importa `UpdateCommercialExpenseDto`):

```ts
async updateFromWhatsApp(input: {
  user: AuthUser;
  conversationId: string;
  expenseId: string;
  dto: UpdateCommercialExpenseDto;
}): Promise<{ id: string; status: string }> {
  // `update` ya valida que el submitter puede editar y auto-reenvía
  // requiere_correccion -> pendiente. Una sola llamada = una sola reenvío.
  const updated = await this.expensesService.update(input.user, input.expenseId, input.dto);

  const openCase = await this.noraCaseService.findOpenCase(input.conversationId);
  if (openCase) {
    await this.noraCaseService.updateCase(openCase.id, {
      status: NoraConversationCaseStatus.executed,
      executedEntityType: "CommercialExpense",
      executedEntityId: updated.id,
    });
  }

  return { id: updated.id, status: updated.status };
}
```

- [ ] **Step 5: Add the controller route**

En `nora-agent.controller.ts` (importa `Param`, `Patch`, `UpdateWhatsAppExpenseDto`):

```ts
@Roles("administrador", "director_comercial", "comercial", "facturacion")
@Patch("expenses/:id")
async updateExpense(
  @CurrentUser() user: AuthUser,
  @Param("id") id: string,
  @Body(new ValidationPipe({ whitelist: true, transform: true }))
  dto: UpdateWhatsAppExpenseDto,
) {
  const { conversationId, ...expense } = dto;
  return this.execution.updateFromWhatsApp({
    user,
    conversationId,
    expenseId: id,
    dto: expense as never,
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest --config test/jest-e2e.json -t "updateFromWhatsApp"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/whatsapp apps/api/test/nora-agent.e2e-spec.ts
git commit -m "feat(whatsapp): PATCH agent expense endpoint applies correction + closes case"
```

---

### Task 5: Tool `update_expense` en el agente Nora

**Files:**
- Modify: `agents/nora/src/tools/expenses.py`
- Test: `agents/nora/tests/test_expenses_tool.py`

**Interfaces:**
- Consumes: `PATCH /whatsapp/agent/expenses/:id` (Task 4), `NestJSClient.patch` (`nestjs_client.py:62`).
- Produces: tool `update_expense` (LangChain `@tool`).

- [ ] **Step 1: Write the failing test**

Añade a `agents/nora/tests/test_expenses_tool.py`:

```python
from src.tools.expenses import update_expense


def test_update_expense_patches_agent_endpoint():
    fake_client = AsyncMock()
    fake_client.patch = AsyncMock(return_value={"id": "exp_1", "status": "pendiente"})

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            update_expense.ainvoke(
                {
                    "expense_id": "exp_1",
                    "supplier_nit": "900123456",
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    fake_client.patch.assert_awaited_once()
    path, payload = fake_client.patch.await_args.args
    assert path == "/whatsapp/agent/expenses/exp_1"
    assert payload["supplierNit"] == "900123456"
    assert payload["conversationId"] == "conv_1"
    assert "pendiente" in result


def test_update_expense_surfaces_api_error_detail():
    fake_client = AsyncMock()
    fake_client.base_url = "http://api:3001"
    fake_client.patch = AsyncMock(side_effect=NestJSAPIError(400, "amount must not be less than 1"))

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            update_expense.ainvoke(
                {
                    "expense_id": "exp_1",
                    "amount": 0,
                    "conversation_id": "conv_1",
                    "auth_token": "Bearer scoped",
                }
            )
        )

    assert result.startswith("Error")
    assert "400" in result
    assert "amount must not be less than 1" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_expenses_tool.py -k update_expense -q`
Expected: FAIL (`ImportError: cannot import name 'update_expense'`).

- [ ] **Step 3: Implement the tool**

En `agents/nora/src/tools/expenses.py`, añade (mismo manejo de errores que `create_expense`):

```python
@tool
async def update_expense(
    expense_id: str,
    conversation_id: Annotated[str, InjectedState("conversation_id")],
    auth_token: Annotated[str, InjectedState("auth_token")],
    expense_date: Optional[str] = None,
    category: Optional[str] = None,
    amount: Optional[float] = None,
    description: Optional[str] = None,
    supplier_name: Optional[str] = None,
    supplier_nit: Optional[str] = None,
    invoice_number: Optional[str] = None,
    payment_method: Optional[str] = None,
    customer_id: Optional[str] = None,
    visit_id: Optional[str] = None,
) -> str:
    """
    Corrige un gasto existente que está en estado 'requiere_correccion' y lo
    reenvía a revisión. Llama esta herramienta UNA sola vez, cuando el comercial
    haya confirmado todos los cambios. Pasa SOLO los campos que cambian.

    Args:
        expense_id: ID del gasto a corregir (viene en el [CASO DE GASTO]).
        Resto de campos: mismos valores válidos que create_expense; opcionales.
    """
    payload: dict = {"conversationId": conversation_id}
    optional = {
        "expenseDate": expense_date,
        "category": category,
        "amount": amount,
        "description": description,
        "supplierName": supplier_name,
        "supplierNit": supplier_nit,
        "invoiceNumber": invoice_number,
        "paymentMethod": payment_method,
        "customerId": customer_id,
        "visitId": visit_id,
    }
    for key, value in optional.items():
        if value is not None:
            payload[key] = value

    client = NestJSClient(auth_token)
    try:
        result = await client.patch(f"/whatsapp/agent/expenses/{expense_id}", payload)
        status = result.get("status", "pendiente")
        return f"Gasto corregido y reenviado a revisión. Estado: {status}."
    except NestJSAPIError as e:
        msg = f"Error al corregir el gasto [HTTP {e.status_code}]: {e.detail}"
        logger.error("update_expense API error: %s", msg)
        return msg
    except Exception as e:
        msg = (
            f"Error inesperado al corregir el gasto (destino {client.base_url}): "
            f"{type(e).__name__}: {str(e)}"
        )
        logger.error("update_expense unexpected error: %s", msg)
        return msg
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_expenses_tool.py -k update_expense -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/tools/expenses.py agents/nora/tests/test_expenses_tool.py
git commit -m "feat(nora): add update_expense tool for WhatsApp corrections"
```

---

### Task 6: Modo corrección en el agente (registro del tool + prompt + contexto)

**Files:**
- Modify: `agents/nora/src/whatsapp_agent.py` (`EXPENSE_TOOLS:20`, `_case_context_block:58-70`)
- Modify: `agents/nora/src/prompts/expense_agent.py`
- Test: `agents/nora/tests/test_whatsapp_agent.py`

**Interfaces:**
- Consumes: `update_expense` (Task 5).

- [ ] **Step 1: Write the failing test**

Añade a `agents/nora/tests/test_whatsapp_agent.py` (sigue el estilo de los tests existentes en ese archivo; este verifica que el bloque de contexto expone el modo corrección):

```python
from src.whatsapp_agent import _case_context_block
from src.models.whatsapp_models import WhatsAppAgentRequest


def test_case_block_includes_correction_mode():
    request = WhatsAppAgentRequest(
        current_message="el NIT es 900123456",
        history=[],
        open_case={
            "id": "case_1",
            "type": "expense",
            "status": "collecting_info",
            "extractedData": {
                "mode": "correction",
                "expenseId": "exp_1",
                "reviewNote": "Falta el NIT del proveedor",
            },
            "missingFields": [],
            "attachments": [],
            "lastQuestion": None,
        },
        conversation_id="conv_1",
        auth="Bearer x",
    )
    block = _case_context_block(request)
    assert "correccion" in block.lower()
    assert "exp_1" in block
    assert "Falta el NIT" in block
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_agent.py -k correction_mode -q`
Expected: FAIL (el bloque actual no incluye expenseId/motivo).

- [ ] **Step 3: Register the tool and extend the case block**

En `whatsapp_agent.py`:

```python
from .tools.expenses import create_expense, lookup_customer, update_expense

EXPENSE_TOOLS = [lookup_customer, create_expense, update_expense]
```

Reemplaza `_case_context_block` para exponer el modo corrección:

```python
def _case_context_block(request: WhatsAppAgentRequest) -> str:
    case = request.open_case
    if not case:
        return "[CASO DE GASTO] No hay caso abierto."
    has_support = bool(case.attachments) or bool(request.attachments)
    data = case.extractedData or {}
    base = (
        "[CASO DE GASTO]\n"
        f"- estado: {case.status}\n"
        f"- datos leidos: {json.dumps(data, ensure_ascii=False)}\n"
        f"- campos faltantes: {json.dumps(case.missingFields, ensure_ascii=False)}\n"
        f"- soporte adjunto: {'si' if has_support else 'no'}"
    )
    if data.get("mode") == "correction":
        base += (
            "\n- MODO: correccion de un gasto YA registrado\n"
            f"- expense_id: {data.get('expenseId')}\n"
            f"- motivo de correccion: {data.get('reviewNote')}"
        )
    return base
```

> Nota: `case.extractedData` se accede como atributo del modelo Pydantic `open_case`. Si `extractedData` es un dict en el modelo, `data.get(...)` funciona; confirma el tipo en `models/whatsapp_models.py` y ajusta el acceso si es necesario.

- [ ] **Step 4: Add the correction branch to the prompt**

En `prompts/expense_agent.py`, añade antes de `## Estilo`:

```python
"""
## Modo corrección
Si el [CASO DE GASTO] indica MODO: correccion, el gasto YA existe y un revisor
pidió un ajuste (ver "motivo de correccion"). En ese caso:
1. Saluda y explica brevemente qué se debe corregir según el motivo.
2. Pide o recibe el dato corregido en lenguaje natural.
3. Cuando el comercial confirme el cambio, llama a `update_expense` UNA sola vez
   con el `expense_id` del caso y SOLO los campos que cambian.
4. Tras corregir, confirma con naturalidad que el gasto volvió a revisión.
   NO uses `create_expense` en modo corrección.
Si `update_expense` devuelve un texto que empieza con "Error", respóndelo EXACTO,
palabra por palabra.
"""
```

(Concaténalo dentro del string `EXPENSE_AGENT_PROMPT`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_agent.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/nora/src/whatsapp_agent.py agents/nora/src/prompts/expense_agent.py agents/nora/tests/test_whatsapp_agent.py
git commit -m "feat(nora): correction mode in expense agent (tool + prompt + context)"
```

---

### Task 7: Registrar la plantilla `correccion_gasto` en Kapso/Meta

Tarea de operaciones (sin código de app). Usa los scripts del skill `integrate-whatsapp` (`~/.claude/skills/integrate-whatsapp/scripts/`). Requiere `KAPSO_API_KEY` (y `KAPSO_API_BASE_URL`) en el entorno.

- [ ] **Step 1: Descubrir IDs**

Run: `node scripts/list-platform-phone-numbers.mjs`
Anota `business_account_id` (WABA, para crear) y `phone_number_id` (para enviar).

- [ ] **Step 2: Crear el archivo de plantilla**

Crea `correccion-gasto.json`:

```json
{
  "name": "correccion_gasto",
  "language": "es",
  "category": "UTILITY",
  "parameter_format": "NAMED",
  "components": [
    {
      "type": "BODY",
      "text": "Hola {{nombre}}, tu gasto por {{valor}} requiere corrección. Motivo: {{motivo}}. Respóndeme aquí y te ayudo a corregirlo.",
      "example": {
        "body_text_named_params": [
          { "param_name": "nombre", "example": "Carlos" },
          { "param_name": "valor",  "example": "$50.000" },
          { "param_name": "motivo", "example": "falta el NIT del proveedor" }
        ]
      }
    }
  ]
}
```

- [ ] **Step 3: Crear la plantilla en Meta**

Run: `node scripts/create-template.mjs --business-account-id <WABA_ID> --file correccion-gasto.json`

- [ ] **Step 4: Verificar aprobación**

Run: `node scripts/template-status.mjs --business-account-id <WABA_ID> --name correccion_gasto`
Expected: `APPROVED` (puede tardar de minutos a 1–2 días).

- [ ] **Step 5: Probar el envío de extremo a extremo**

Crea `send-correccion-gasto.json`:

```json
{
  "messaging_product": "whatsapp",
  "to": "<telefono-de-prueba>",
  "type": "template",
  "template": {
    "name": "correccion_gasto",
    "language": { "code": "es" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "parameter_name": "nombre", "text": "Carlos" },
          { "type": "text", "parameter_name": "valor",  "text": "$50.000" },
          { "type": "text", "parameter_name": "motivo", "text": "falta el NIT del proveedor" }
        ]
      }
    ]
  }
}
```

Run: `node scripts/send-template.mjs --phone-number-id <PHONE_NUMBER_ID> --file send-correccion-gasto.json`
Expected: el teléfono de prueba recibe el mensaje. Confirma que `sendViaKapsoTemplate` (Task 1) construye el mismo `components`.

- [ ] **Step 6: Confirmar configuración de entorno**

Verifica en el entorno de despliegue: `KAPSO_API_KEY`, `KAPSO_API_BASE_URL`, `NORA_WHATSAPP_AGENT_EXPENSES=true`, `NORA_API_URL`, y que los comerciales tengan `User.phone` poblado. Sin estas, la corrección por WhatsApp no opera (degrada al flujo de la app).

---

## Verificación final (todas las tareas)

- [ ] `cd apps/api && npx jest --config test/jest-e2e.json` → verde.
- [ ] `cd agents/nora && python -m pytest -q` → verde.
- [ ] Prueba manual de extremo a extremo: pedir corrección en el panel → llega el WhatsApp → responder el dato → Nora corrige → el gasto vuelve a `pendiente` y aparece corregido en el panel.

## Notas de implementación / desviaciones del spec

- **Sin flag `resubmit`:** el spec mencionaba un parámetro `resubmit`. Se eliminó: el `update` existente del servicio de gastos ya auto-reenvía `requiere_correccion → pendiente` en cualquier edición. Como el agente llama `update_expense` una sola vez (al confirmar), eso ES el reenvío único acordado ("Nora confirma y reenvía"). Menos código, mismo comportamiento.
- **Caso abierto duplicado:** si ya hay un caso abierto en la conversación del comercial al pedir corrección, `findOpenCase` devuelve el más reciente por `updatedAt`. Edge case aceptable; el caso de corrección recién creado gana.
```
