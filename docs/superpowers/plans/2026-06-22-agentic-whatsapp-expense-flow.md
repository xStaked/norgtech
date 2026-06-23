# Agentic WhatsApp Expense Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the WhatsApp expense flow from the deterministic regex planner to the LLM agent, so the bot understands free-form confirmations ("lo veo bien") and actually creates the `CommercialExpense` record when confirmed.

**Architecture:** NestJS stays the source of truth for conversation/case state. For expense-flow turns, NestJS calls a new stateless Nora endpoint `POST /whatsapp/agent` (passing message history + open case + a short-lived scoped JWT for the resolved commercial user). The LLM agent calls backend HTTP tools directly — `lookup_customer` and `create_expense` — to read and act, then returns a natural-language reply. Expense creation goes through a new internal endpoint that reuses the existing OCR'd support image (no re-upload), creates the expense as `pendiente`, and atomically marks the case `executed`. Other flows (orders, payments, agenda) keep using the planner; the agent path falls back to the planner on error.

**Tech Stack:** Python (FastAPI, LangGraph, LangChain, httpx) for Nora; NestJS (Prisma, jsonwebtoken, jest) for the API; pytest for Nora tests.

## Global Constraints

- Nora→NestJS HTTP uses the existing `NestJSClient` which forwards the `Authorization` header verbatim; base URL from `NESTJS_API_URL` (default `http://localhost:3001`). (`agents/nora/src/tools/nestjs_client.py`)
- NestJS→Nora HTTP uses native `fetch`; base URL from `process.env.NORA_API_URL` (default `http://localhost:8000`). (`apps/api/src/modules/whatsapp/nora-routing.service.ts:233`)
- JWT signing: `jsonwebtoken.sign(payload, AUTH_JWT_SECRET, { expiresIn })`; payload shape `{ sub, role, email }`; secret `AUTH_JWT_SECRET` from `apps/api/src/modules/auth/auth.constants.ts`. (`apps/api/src/modules/auth/auth.service.ts:32`)
- Expense required fields: `amount`, `expenseDate`, `category`, `description`. Optional: `supplierName`, `supplierNit`, `invoiceNumber`, `paymentMethod`, `customerId`, `visitId`, `extractionConfidence`, `extractionModel`. (`apps/api/src/modules/commercial-expenses/dto/create-commercial-expense.dto.ts`)
- `category` must be a valid `CommercialExpenseCategory` enum value.
- Spanish, Colombian "tú", warm/concise — matches existing `NORA_SYSTEM_PROMPT` voice.
- New behavior is gated behind env flag `NORA_WHATSAPP_AGENT_EXPENSES` (default off); when off or on agent error, the planner path runs unchanged.
- The `executedEntityType`/`executedEntityId` columns already exist on `NoraConversationCase` (`apps/api/prisma/schema.prisma:431-432`) — **no Prisma migration is required.**

---

## Testing Conventions (AUTHORITATIVE — supersedes per-task test mechanics)

The task bodies below sometimes show tests in a mocked-unit style with commands like
`npx jest src/modules/.../foo.spec.ts`. **That style does not exist in this repo. Ignore those
commands and colocated `*.spec.ts` paths.** Keep each task's test *intent* (what to assert), but
implement and run tests as described here.

### NestJS (`apps/api`)

- **No colocated unit specs exist.** All tests live in `apps/api/test/*.e2e-spec.ts` and run under
  `test/jest-e2e.json` (`testRegex: .*\.e2e-spec\.ts$`, `rootDir: ".."`).
- **Run:** `cd apps/api && npm test -- -t "<test name>"` for a single test;
  `cd apps/api && npm test -- test/<file>.e2e-spec.ts` for one file. (`npm test` =
  `jest --watchman=false --config ./test/jest-e2e.json`.)
- **Two valid styles, both already in the repo:**
  1. **Full-app + supertest** (e.g. `whatsapp.e2e-spec.ts`, `commercial-expenses.e2e-spec.ts`):
     `Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prismaStub)...`,
     `app.init()`, then `request(app.getHttpServer()).post(...).set("Authorization", \`Bearer ${token}\`)`.
     Use this for the HTTP endpoint (Task 5) and the routing branch (Task 11).
  2. **Service-level via TestingModule with mocked deps** (precedent: `nora-expense-extraction.e2e-spec.ts`
     builds a module with `{ downloadMedia: jest.fn(), sendAgentReply: jest.fn() }`-style provider values).
     Use this for the pure service/auth tasks (1, 2, 3, 4) — build a `TestingModule` providing the unit
     under test plus mocked collaborators, get it via `moduleRef.get(...)`, and assert. Place these in a
     new `apps/api/test/nora-agent.e2e-spec.ts` unless a more specific existing file fits.
- **In-memory Prisma stub:** mock only the methods the unit touches, as jest fns over module-scope arrays.
  Reset arrays in `beforeEach` with `arr.splice(0)`. Shapes to copy:
  - `noraConversationCase.findFirst({ where })` — filter by `id`/`conversationId`/`status.in`, sort by
    `updatedAt` desc, return first or `null`.
  - `noraConversationCase.update({ where:{id}, data })` — merge `data` into the stored record.
  - `whatsAppConversation.findUnique({ where:{id}, include })` — return record with `account` relation
    (`{ phoneNumberId }`) when `include.account`.
  - `commercialExpense.create({ data, include })` — push and return with `status: "pendiente"`.
  - `$transaction(cb)` — `cb(txStub)` where `txStub` includes a `$queryRaw` jest fn (the case lock helper
    issues a raw query; return `[{ id: caseId }]`).
  - `user.findUnique({ where:{email|id} })` — look up the seeded users array (needed for login + scoped token).
- **Auth tokens:** seed a users array with the shared bcrypt hash
  `"$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2"` (password `Admin123*`), then
  `request(app.getHttpServer()).post("/auth/login").send({ email, password: "Admin123*" })` →
  `body.accessToken`. Roles available in fixtures: `administrador`, `comercial`, `facturacion`.
- **External services:** override `R2StorageService` (`uploadExpenseSupport`/`getObjectStream`/`deleteObject`)
  and the OCR provider as in `commercial-expenses.e2e-spec.ts`. `WhatsAppService.downloadMedia` already
  short-circuits in test mode (`whatsapp.service.ts:408` returns a fake buffer) — no Kapso needed.
- **Nora HTTP from NestJS:** `globalThis.fetch` is the seam. For the routing-branch test (Task 11),
  stub `globalThis.fetch` and assert it was called with `…/whatsapp/agent` (not `/whatsapp/route`), and
  return a canned `{ reply_text, case_update, executed_entity }` body. Restore `originalFetch` in `afterAll`.
- **Env:** set `NORA_WHATSAPP_AGENT_EXPENSES="true"` (and restore) within tests that exercise the agent branch.

### Nora (`agents/nora`)

- **Interpreter:** the repo has a venv. Run `cd agents/nora && .venv/bin/python -m pytest tests/<file> -v`.
  (Plain `python`/system `python3` lack pytest.) Tests import `from src.xxx import …`.
- **Async tests:** `pytest-asyncio` is not a declared dependency. **Do not use `@pytest.mark.asyncio`.**
  Wrap async calls with `asyncio.run(...)`, e.g. `result = asyncio.run(create_expense.ainvoke({...}))`.
- Place new tests in `agents/nora/tests/` (e.g. `test_expenses_tool.py`, `test_whatsapp_agent.py`,
  `test_whatsapp_agent_endpoint.py`), matching the existing `test_whatsapp_router.py` style.
- The live-LLM test (`test_whatsapp_agent.py`, Task 9) needs model credentials in the env; if absent,
  skip with `pytest.importorskip`/`pytest.mark.skipif` on the API key rather than stubbing the LLM.

---

## File Structure

**NestJS (`apps/api/src`):**
- Modify `modules/whatsapp/dto/nora-case.dto.ts` — add `executedEntityType`/`executedEntityId` to `NoraCaseTransitionInput`.
- Modify `modules/whatsapp/nora-case.service.ts` — persist those two fields in `updateCase`.
- Modify `modules/commercial-expenses/commercial-expenses.service.ts` — extract `createWithUpload`, add `createFromBuffer`.
- Create `modules/whatsapp/nora-expense-execution.service.ts` — idempotent "create expense from WhatsApp case" orchestration.
- Modify `modules/auth/auth.service.ts` — add `mintScopedToken(userId)`.
- Create `modules/whatsapp/nora-agent.controller.ts` — internal `POST /whatsapp/agent/expenses` endpoint.
- Create `modules/whatsapp/dto/execute-whatsapp-expense.dto.ts` — body DTO for that endpoint.
- Modify `modules/whatsapp/whatsapp.module.ts` — wire new providers/controller/imports.
- Modify `modules/whatsapp/nora-routing.service.ts` — expense-flow branch + agent call + fallback.

**Nora (`agents/nora/src`):**
- Create `tools/expenses.py` — `create_expense` tool (+ re-export `lookup_customer`).
- Create `prompts/expense_agent.py` — expense-flow system prompt.
- Create `whatsapp_agent.py` — stateless graph + `run_whatsapp_agent(request)`.
- Modify `models/whatsapp_models.py` — agent request/response models + attachments on open case.
- Modify `main.py` — `POST /whatsapp/agent` route.

**Tests:**
- `agents/nora/tests/test_whatsapp_agent.py`, `agents/nora/tests/test_expenses_tool.py`
- `apps/api/src/modules/whatsapp/nora-expense-execution.service.spec.ts`
- `apps/api/src/modules/whatsapp/nora-agent.controller.spec.ts`
- `apps/api/src/modules/auth/auth.service.spec.ts` (extend)
- `apps/api/src/modules/whatsapp/nora-routing.service.spec.ts` (extend)

---

## Task 1: Persist `executedEntityType`/`executedEntityId` in case updates

**Files:**
- Modify: `apps/api/src/modules/whatsapp/dto/nora-case.dto.ts:20-32`
- Modify: `apps/api/src/modules/whatsapp/nora-case.service.ts:37-76`
- Test: `apps/api/src/modules/whatsapp/nora-case.service.spec.ts` (create if absent)

**Interfaces:**
- Produces: `NoraCaseTransitionInput` gains optional `executedEntityType?: string | null` and `executedEntityId?: string | null`; `updateCase(caseId, input)` persists them when present.

- [ ] **Step 1: Write the failing test**

Create/append `apps/api/src/modules/whatsapp/nora-case.service.spec.ts`:

```typescript
import { Test } from "@nestjs/testing";
import { NoraConversationCaseStatus, NoraConversationCaseType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NoraCaseService } from "./nora-case.service";

describe("NoraCaseService.updateCase executed fields", () => {
  it("persists executedEntityType and executedEntityId", async () => {
    const existing = {
      id: "case_1",
      extractedData: {},
      missingFields: [],
      attachments: [],
    };
    const update = jest.fn().mockResolvedValue({ ...existing, status: "executed" });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      noraConversationCase: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update,
      },
    };
    const prisma = {
      $transaction: (fn: (c: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [NoraCaseService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = moduleRef.get(NoraCaseService);

    await service.updateCase("case_1", {
      status: NoraConversationCaseStatus.executed,
      executedEntityType: "CommercialExpense",
      executedEntityId: "exp_1",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "case_1" },
        data: expect.objectContaining({
          status: NoraConversationCaseStatus.executed,
          executedEntityType: "CommercialExpense",
          executedEntityId: "exp_1",
        }),
      }),
    );
  });
});
```

> Note: `lockCaseForUpdate` uses a raw query; the `tx.$queryRaw` mock above satisfies it. If the real lock helper uses a different method name, mirror it in the mock — check `nora-case.service.ts` `lockCaseForUpdate`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/whatsapp/nora-case.service.spec.ts -t "executed fields"`
Expected: FAIL — `update` called without `executedEntityType`/`executedEntityId`.

- [ ] **Step 3: Add fields to the input type**

In `apps/api/src/modules/whatsapp/dto/nora-case.dto.ts`, extend `NoraCaseTransitionInput`:

```typescript
export type NoraCaseTransitionInput = {
  conversationId: string;
  type: NoraConversationCaseType;
  parentCaseId?: string | null;
  status?: NoraConversationCaseStatus;
  extractedData?: NoraCaseJsonObject;
  missingFields?: string[];
  attachments?: NoraCaseAttachment[];
  proposal?: NoraCaseJsonObject | null;
  lastQuestion?: string | null;
  riskLevel?: NoraCaseRiskLevel;
  createdByUserId?: string | null;
  executedEntityType?: string | null;
  executedEntityId?: string | null;
};
```

- [ ] **Step 4: Persist them in `updateCase`**

In `nora-case.service.ts` `updateCase`, inside the `data: { ... }` object (after the `riskLevel` spread), add:

```typescript
        ...(input.executedEntityType !== undefined && {
          executedEntityType: input.executedEntityType,
        }),
        ...(input.executedEntityId !== undefined && {
          executedEntityId: input.executedEntityId,
        }),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/whatsapp/nora-case.service.spec.ts -t "executed fields"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp/dto/nora-case.dto.ts apps/api/src/modules/whatsapp/nora-case.service.ts apps/api/src/modules/whatsapp/nora-case.service.spec.ts
git commit -m "feat(whatsapp): persist executedEntity fields in case updates"
```

---

## Task 2: Create expense from an in-memory buffer (no multipart re-upload)

**Files:**
- Modify: `apps/api/src/modules/commercial-expenses/commercial-expenses.service.ts:68-138,555-568`
- Test: `apps/api/src/modules/commercial-expenses/commercial-expenses.service.spec.ts` (create if absent)

**Interfaces:**
- Produces: `CommercialExpensesService.createFromBuffer(user: AuthUser, dto: CreateCommercialExpenseDto, file: ExpenseBufferFile): Promise<ExpenseWithRelations>` where `ExpenseBufferFile = { buffer: Buffer; originalname: string; mimetype: string; size: number }`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/commercial-expenses/commercial-expenses.service.spec.ts`:

```typescript
import { CommercialExpenseCategory } from "@prisma/client";
import { CommercialExpensesService } from "./commercial-expenses.service";

describe("CommercialExpensesService.createFromBuffer", () => {
  it("uploads the buffer and creates an expense", async () => {
    const uploaded = { bucket: "b", objectKey: "k" };
    const storageService = {
      uploadExpenseSupport: jest.fn().mockResolvedValue(uploaded),
      deleteObject: jest.fn(),
    };
    const created = { id: "exp_1", status: "pendiente" };
    const tx = {
      commercialExpense: { create: jest.fn().mockResolvedValue(created) },
    };
    const prisma = { $transaction: (fn: (c: typeof tx) => unknown) => fn(tx) };
    const auditService = { record: jest.fn() };

    const service = new CommercialExpensesService(
      prisma as never,
      storageService as never,
      auditService as never,
    );
    // Stub relation validation to a no-op.
    (service as never as { validateOptionalRelations: () => Promise<void> }).validateOptionalRelations =
      async () => undefined;

    const result = await service.createFromBuffer(
      { id: "user_1" } as never,
      {
        expenseDate: "2026-04-24",
        category: CommercialExpenseCategory.alimentacion,
        amount: 25000,
        description: "Almuerzo",
      } as never,
      { buffer: Buffer.from("img"), originalname: "soporte.jpg", mimetype: "image/jpeg", size: 3 },
    );

    expect(storageService.uploadExpenseSupport).toHaveBeenCalled();
    expect(tx.commercialExpense.create).toHaveBeenCalled();
    expect(result).toEqual(created);
  });
});
```

> Note: match the real `CommercialExpensesService` constructor parameter order — read the constructor and adjust the `new CommercialExpensesService(...)` args accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/commercial-expenses/commercial-expenses.service.spec.ts`
Expected: FAIL — `createFromBuffer is not a function`.

- [ ] **Step 3: Refactor `create` to share an upload-and-persist core**

In `commercial-expenses.service.ts`, add this type near the existing `ExpenseSupportFile` alias:

```typescript
export type ExpenseBufferFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};
```

Replace the body of `create(...)` so it delegates, and add the shared core + new method. Keep the existing R2 cleanup-on-failure behavior:

```typescript
async create(
  user: AuthUser,
  dto: CreateCommercialExpenseDto,
  file?: ExpenseSupportFile,
): Promise<ExpenseWithRelations> {
  const supportFile = this.assertSupportFile(file);
  return this.createWithUpload(user, dto, {
    buffer: supportFile.buffer,
    originalname: supportFile.originalname,
    mimetype: supportFile.mimetype,
    size: supportFile.size,
  });
}

async createFromBuffer(
  user: AuthUser,
  dto: CreateCommercialExpenseDto,
  file: ExpenseBufferFile,
): Promise<ExpenseWithRelations> {
  return this.createWithUpload(user, dto, file);
}

private async createWithUpload(
  user: AuthUser,
  dto: CreateCommercialExpenseDto,
  file: ExpenseBufferFile,
): Promise<ExpenseWithRelations> {
  await this.validateOptionalRelations(dto.customerId, dto.visitId);

  const uploaded = await this.storageService.uploadExpenseSupport({
    fileName: file.originalname,
    contentType: file.mimetype,
    body: file.buffer,
    sizeBytes: file.size,
  });

  try {
    return await this.prisma.$transaction(async (tx) => {
      const extractionModel = dto.extractionModel?.trim() || null;
      const extractionConfidence =
        dto.extractionConfidence === undefined || dto.extractionConfidence === null
          ? null
          : new Prisma.Decimal(dto.extractionConfidence).toDecimalPlaces(4);
      const expense = await tx.commercialExpense.create({
        data: {
          expenseDate: new Date(dto.expenseDate),
          category: dto.category,
          amount: new Prisma.Decimal(dto.amount).toDecimalPlaces(2),
          description: dto.description,
          supplierName: dto.supplierName?.trim() || null,
          supplierNit: dto.supplierNit?.trim() || null,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          paymentMethod: dto.paymentMethod?.trim() || null,
          extractionConfidence,
          extractionModel,
          extractionReviewedAt:
            extractionConfidence === null && extractionModel === null ? null : new Date(),
          submittedByUserId: user.id,
          customerId: dto.customerId ?? null,
          visitId: dto.visitId ?? null,
          createdBy: user.id,
          updatedBy: user.id,
          supports: {
            create: this.supportCreateDataFromBuffer(user, file, uploaded),
          },
        },
        include: commercialExpenseInclude,
      });

      await this.auditService.record(
        {
          entityType: "CommercialExpense",
          entityId: expense.id,
          action: "commercial_expense.created",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(expense)),
        },
        tx,
      );

      return expense;
    });
  } catch (error) {
    await this.storageService.deleteObject(uploaded.objectKey).catch(() => undefined);
    throw error;
  }
}
```

Then add a buffer-shaped support-create helper alongside the existing `supportCreateData`:

```typescript
private supportCreateDataFromBuffer(
  user: AuthUser,
  file: ExpenseBufferFile,
  uploaded: UploadedExpenseSupport,
): Prisma.CommercialExpenseSupportCreateWithoutExpenseInput {
  return {
    bucket: uploaded.bucket,
    objectKey: uploaded.objectKey,
    fileName: file.originalname,
    contentType: file.mimetype,
    sizeBytes: file.size,
    uploadedBy: { connect: { id: user.id } },
  };
}
```

> The original `supportCreateData(user, file: ExpenseSupportFile, uploaded)` may now be unused; if so, delete it. If still referenced elsewhere, leave it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/commercial-expenses/commercial-expenses.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Verify existing expense tests still pass**

Run: `cd apps/api && npx jest src/modules/commercial-expenses`
Expected: PASS (the Multer `create` path still works via the shared core).

- [ ] **Step 6: Export the service from its module**

In `apps/api/src/modules/commercial-expenses/commercial-expenses.module.ts`, ensure `CommercialExpensesService` is in `exports: [...]` (add it if missing).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/commercial-expenses/
git commit -m "feat(expenses): add createFromBuffer for already-stored support images"
```

---

## Task 3: Mint a short-lived scoped token for a resolved user

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts:24-48`
- Test: `apps/api/src/modules/auth/auth.service.spec.ts` (create if absent)

**Interfaces:**
- Produces: `AuthService.mintScopedToken(userId: string): Promise<string>` — signs a `{ sub, role, email }` JWT for the user with a 10-minute TTL. Throws `UnauthorizedException` if the user is missing or inactive.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/auth/auth.service.spec.ts`:

```typescript
import * as jsonwebtoken from "jsonwebtoken";
import { AuthService } from "./auth.service";
import { AUTH_JWT_SECRET } from "./auth.constants";

describe("AuthService.mintScopedToken", () => {
  it("signs a short-lived token scoped to the user", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user_1",
          email: "c@x.com",
          role: "comercial",
          active: true,
        }),
      },
    };
    const service = new AuthService(prisma as never);

    const token = await service.mintScopedToken("user_1");
    const decoded = jsonwebtoken.verify(token, AUTH_JWT_SECRET) as Record<string, unknown>;

    expect(decoded.sub).toBe("user_1");
    expect(decoded.role).toBe("comercial");
    expect(decoded.email).toBe("c@x.com");
  });

  it("rejects inactive or missing users", async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new AuthService(prisma as never);
    await expect(service.mintScopedToken("nope")).rejects.toThrow();
  });
});
```

> Match the real `AuthService` constructor signature (it may inject more than `PrismaService`); adjust the `new AuthService(...)` args.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/auth/auth.service.spec.ts`
Expected: FAIL — `mintScopedToken is not a function`.

- [ ] **Step 3: Implement `mintScopedToken`**

In `auth.service.ts`, add (mirroring the existing `login` sign call, but a shorter TTL):

```typescript
async mintScopedToken(userId: string): Promise<string> {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) {
    throw new UnauthorizedException("Cannot mint token for user");
  }
  return jsonwebtoken.sign(
    { sub: user.id, role: user.role, email: user.email },
    AUTH_JWT_SECRET,
    { expiresIn: "10m" },
  );
}
```

Ensure `UnauthorizedException` and `jsonwebtoken`/`AUTH_JWT_SECRET` are already imported (they are, used by `login`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/auth/auth.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Export AuthService**

Confirm `AuthService` is exported from `apps/api/src/modules/auth/auth.module.ts` `exports: [...]` (WhatsApp module already imports `AuthModule`). Add it if missing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth/
git commit -m "feat(auth): mint short-lived scoped token for resolved user"
```

---

## Task 4: Idempotent "execute expense from WhatsApp case" orchestration

**Files:**
- Create: `apps/api/src/modules/whatsapp/nora-expense-execution.service.ts`
- Test: `apps/api/src/modules/whatsapp/nora-expense-execution.service.spec.ts`

**Interfaces:**
- Consumes: `NoraCaseService.findOpenCase`, `NoraCaseService.updateCase` (Task 1), `CommercialExpensesService.createFromBuffer` (Task 2), `WhatsAppService.downloadMedia(phoneNumberId, mediaId)`.
- Produces:
  ```typescript
  type ExecuteExpenseInput = {
    user: AuthUser;
    conversationId: string;
    dto: CreateCommercialExpenseDto;
  };
  type ExecuteExpenseResult = { id: string; status: string; alreadyExisted: boolean };
  class NoraExpenseExecutionService {
    executeFromWhatsApp(input: ExecuteExpenseInput): Promise<ExecuteExpenseResult>;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/whatsapp/nora-expense-execution.service.spec.ts`:

```typescript
import { CommercialExpenseCategory } from "@prisma/client";
import { NoraExpenseExecutionService } from "./nora-expense-execution.service";

const baseDto = {
  expenseDate: "2026-04-24",
  category: CommercialExpenseCategory.alimentacion,
  amount: 25000,
  description: "Almuerzo",
} as never;

function buildService(overrides: Partial<Record<string, unknown>> = {}) {
  const caseRecord = {
    id: "case_1",
    type: "expense",
    status: "ready_for_review",
    attachments: [{ provider: "kapso", kind: "image", providerMediaId: "media_1", contentType: "image/jpeg" }],
    executedEntityId: null,
  };
  const noraCaseService = {
    findOpenCase: jest.fn().mockResolvedValue(caseRecord),
    updateCase: jest.fn().mockResolvedValue(undefined),
  };
  const expensesService = {
    createFromBuffer: jest.fn().mockResolvedValue({ id: "exp_1", status: "pendiente" }),
  };
  const whatsAppService = {
    downloadMedia: jest.fn().mockResolvedValue(Buffer.from("img")),
  };
  const conversations = {
    findUnique: jest.fn().mockResolvedValue({ account: { phoneNumberId: "pn_1" } }),
  };
  const prisma = { whatsAppConversation: conversations };
  const service = new NoraExpenseExecutionService(
    noraCaseService as never,
    expensesService as never,
    whatsAppService as never,
    prisma as never,
  );
  Object.assign({ noraCaseService, expensesService, whatsAppService, caseRecord }, overrides);
  return { service, noraCaseService, expensesService, whatsAppService, caseRecord };
}

describe("NoraExpenseExecutionService.executeFromWhatsApp", () => {
  it("creates the expense and marks the case executed", async () => {
    const { service, noraCaseService, expensesService } = buildService();
    const result = await service.executeFromWhatsApp({
      user: { id: "user_1" } as never,
      conversationId: "conv_1",
      dto: baseDto,
    });

    expect(expensesService.createFromBuffer).toHaveBeenCalled();
    expect(noraCaseService.updateCase).toHaveBeenCalledWith(
      "case_1",
      expect.objectContaining({
        status: "executed",
        executedEntityType: "CommercialExpense",
        executedEntityId: "exp_1",
      }),
    );
    expect(result).toEqual({ id: "exp_1", status: "pendiente", alreadyExisted: false });
  });

  it("is idempotent when the case is already executed", async () => {
    const { service, expensesService } = buildService();
    (service as never as { noraCaseService: { findOpenCase: jest.Mock } });
    // Re-wire findOpenCase to an executed case:
    (service["noraCaseService"].findOpenCase as jest.Mock) = jest
      .fn()
      .mockResolvedValue({ id: "case_1", executedEntityId: "exp_existing" });

    const result = await service.executeFromWhatsApp({
      user: { id: "user_1" } as never,
      conversationId: "conv_1",
      dto: baseDto,
    });

    expect(expensesService.createFromBuffer).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "exp_existing", status: "pendiente", alreadyExisted: true });
  });
});
```

> The idempotent test reaches into `service["noraCaseService"]`; make `noraCaseService` a non-private readonly field, or expose it. Simplest: declare constructor params as `public readonly`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/whatsapp/nora-expense-execution.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/whatsapp/nora-expense-execution.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { NoraConversationCaseStatus } from "@prisma/client";
import { AuthUser } from "../auth/types/authenticated-request";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCommercialExpenseDto } from "../commercial-expenses/dto/create-commercial-expense.dto";
import { CommercialExpensesService } from "../commercial-expenses/commercial-expenses.service";
import { NoraCaseAttachment } from "./dto/nora-case.dto";
import { NoraCaseService } from "./nora-case.service";
import { WhatsAppService } from "./whatsapp.service";

export type ExecuteExpenseInput = {
  user: AuthUser;
  conversationId: string;
  dto: CreateCommercialExpenseDto;
};

export type ExecuteExpenseResult = {
  id: string;
  status: string;
  alreadyExisted: boolean;
};

@Injectable()
export class NoraExpenseExecutionService {
  constructor(
    public readonly noraCaseService: NoraCaseService,
    public readonly expensesService: CommercialExpensesService,
    public readonly whatsAppService: WhatsAppService,
    public readonly prisma: PrismaService,
  ) {}

  async executeFromWhatsApp(input: ExecuteExpenseInput): Promise<ExecuteExpenseResult> {
    const openCase = await this.noraCaseService.findOpenCase(input.conversationId);
    if (!openCase) {
      throw new NotFoundException("No open case for conversation");
    }
    if (openCase.executedEntityId) {
      return { id: openCase.executedEntityId, status: "pendiente", alreadyExisted: true };
    }

    const attachment = this.firstImageAttachment(openCase.attachments);
    if (!attachment?.providerMediaId) {
      throw new BadRequestException("Case has no support attachment to link");
    }

    const phoneNumberId = await this.resolvePhoneNumberId(input.conversationId);
    if (!phoneNumberId) {
      throw new BadRequestException("Conversation has no WhatsApp account");
    }

    const buffer = await this.whatsAppService.downloadMedia(
      phoneNumberId,
      attachment.providerMediaId,
    );

    const expense = await this.expensesService.createFromBuffer(input.user, input.dto, {
      buffer,
      originalname: attachment.fileName ?? "soporte-whatsapp.jpg",
      mimetype: attachment.contentType ?? "image/jpeg",
      size: buffer.length,
    });

    await this.noraCaseService.updateCase(openCase.id, {
      status: NoraConversationCaseStatus.executed,
      executedEntityType: "CommercialExpense",
      executedEntityId: expense.id,
    });

    return { id: expense.id, status: expense.status, alreadyExisted: false };
  }

  private firstImageAttachment(value: unknown): NoraCaseAttachment | undefined {
    const list = Array.isArray(value) ? (value as NoraCaseAttachment[]) : [];
    return list.find((a) => a && a.provider === "kapso" && Boolean(a.providerMediaId));
  }

  private async resolvePhoneNumberId(conversationId: string): Promise<string | null> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: { account: true },
    });
    return conversation?.account?.phoneNumberId ?? null;
  }
}
```

> Confirm the `expense.status` enum value name (`pendiente`) and the conversation→account relation field names against the schema; adjust if they differ.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/whatsapp/nora-expense-execution.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-expense-execution.service.ts apps/api/src/modules/whatsapp/nora-expense-execution.service.spec.ts
git commit -m "feat(whatsapp): idempotent expense execution from conversation case"
```

---

## Task 5: Internal endpoint the agent calls to create the expense

**Files:**
- Create: `apps/api/src/modules/whatsapp/dto/execute-whatsapp-expense.dto.ts`
- Create: `apps/api/src/modules/whatsapp/nora-agent.controller.ts`
- Test: `apps/api/src/modules/whatsapp/nora-agent.controller.spec.ts`

**Interfaces:**
- Consumes: `NoraExpenseExecutionService.executeFromWhatsApp` (Task 4); the project's JWT auth guard + `@CurrentUser()` decorator (same ones used by `commercial-expenses.controller.ts`).
- Produces: `POST /whatsapp/agent/expenses` → `ExecuteExpenseResult` JSON.

- [ ] **Step 1: Write the DTO**

Create `apps/api/src/modules/whatsapp/dto/execute-whatsapp-expense.dto.ts`:

```typescript
import { IsString } from "class-validator";
import { CreateCommercialExpenseDto } from "../../commercial-expenses/dto/create-commercial-expense.dto";

export class ExecuteWhatsAppExpenseDto extends CreateCommercialExpenseDto {
  @IsString()
  conversationId!: string;
}
```

- [ ] **Step 2: Write the failing controller test**

Create `apps/api/src/modules/whatsapp/nora-agent.controller.spec.ts`:

```typescript
import { CommercialExpenseCategory } from "@prisma/client";
import { NoraAgentController } from "./nora-agent.controller";

describe("NoraAgentController", () => {
  it("delegates expense execution to the execution service", async () => {
    const execution = {
      executeFromWhatsApp: jest
        .fn()
        .mockResolvedValue({ id: "exp_1", status: "pendiente", alreadyExisted: false }),
    };
    const controller = new NoraAgentController(execution as never);

    const result = await controller.createExpense({ id: "user_1" } as never, {
      conversationId: "conv_1",
      expenseDate: "2026-04-24",
      category: CommercialExpenseCategory.alimentacion,
      amount: 25000,
      description: "Almuerzo",
    } as never);

    expect(execution.executeFromWhatsApp).toHaveBeenCalledWith({
      user: { id: "user_1" },
      conversationId: "conv_1",
      dto: expect.objectContaining({ amount: 25000 }),
    });
    expect(result).toEqual({ id: "exp_1", status: "pendiente", alreadyExisted: false });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/whatsapp/nora-agent.controller.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the controller**

Create `apps/api/src/modules/whatsapp/nora-agent.controller.ts`. Mirror the guard/decorator imports used in `apps/api/src/modules/commercial-expenses/commercial-expenses.controller.ts` (read it for the exact `@UseGuards(...)` guard class and `@CurrentUser()` path):

```typescript
import { Body, Controller, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/authenticated-request";
import { ExecuteWhatsAppExpenseDto } from "./dto/execute-whatsapp-expense.dto";
import { NoraExpenseExecutionService } from "./nora-expense-execution.service";

@Controller("whatsapp/agent")
@UseGuards(JwtAuthGuard)
export class NoraAgentController {
  constructor(private readonly execution: NoraExpenseExecutionService) {}

  @Post("expenses")
  async createExpense(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ExecuteWhatsAppExpenseDto,
  ) {
    const { conversationId, ...expense } = dto;
    return this.execution.executeFromWhatsApp({
      user,
      conversationId,
      dto: expense as never,
    });
  }
}
```

> Adjust `JwtAuthGuard`, `CurrentUser`, and `AuthUser` import paths to match `commercial-expenses.controller.ts` exactly.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx jest src/modules/whatsapp/nora-agent.controller.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-agent.controller.ts apps/api/src/modules/whatsapp/dto/execute-whatsapp-expense.dto.ts apps/api/src/modules/whatsapp/nora-agent.controller.spec.ts
git commit -m "feat(whatsapp): internal endpoint for agent-driven expense creation"
```

---

## Task 6: Wire the new providers/controller into the WhatsApp module

**Files:**
- Modify: `apps/api/src/modules/whatsapp/whatsapp.module.ts:16-33`

**Interfaces:**
- Consumes: Tasks 4, 5, and `CommercialExpensesModule` (Task 2 export).

- [ ] **Step 1: Update the module**

Edit `whatsapp.module.ts`:

```typescript
@Module({
  imports: [AuthModule, CommercialExpensesModule, forwardRef(() => OrdersModule)],
  controllers: [WhatsAppController, WhatsAppWebhookController, NoraAgentController],
  providers: [
    WhatsAppService,
    WhatsAppOrderAutomationService,
    KapsoWebhookService,
    NoraCaseService,
    NoraExpenseExtractionService,
    NoraExpenseExecutionService,
    NoraRoutingService,
    {
      provide: ExpenseExtractionProvider,
      useClass: OpenAIExpenseExtractionProvider,
    },
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
```

Add the imports at the top:

```typescript
import { CommercialExpensesModule } from "../commercial-expenses/commercial-expenses.module";
import { NoraAgentController } from "./nora-agent.controller";
import { NoraExpenseExecutionService } from "./nora-expense-execution.service";
```

- [ ] **Step 2: Verify the module compiles / app boots**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. If `CommercialExpensesModule` import creates a cycle, wrap with `forwardRef(() => CommercialExpensesModule)`.

- [ ] **Step 3: Run the whole whatsapp + expenses suites**

Run: `cd apps/api && npx jest src/modules/whatsapp src/modules/commercial-expenses src/modules/auth`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/whatsapp/whatsapp.module.ts
git commit -m "chore(whatsapp): wire agent controller and expense execution service"
```

---

## Task 7: Nora `create_expense` tool

**Files:**
- Create: `agents/nora/src/tools/expenses.py`
- Test: `agents/nora/tests/test_expenses_tool.py`

**Interfaces:**
- Consumes: `NestJSClient.post` (`agents/nora/src/tools/nestjs_client.py`), `search_customers` (`agents/nora/src/tools/customers.py`).
- Produces: async tool `create_expense(expense_date, category, amount, description, conversation_id, auth_token, supplier_name=None, supplier_nit=None, invoice_number=None, payment_method=None, customer_id=None, visit_id=None, extraction_confidence=None, extraction_model=None) -> str` that POSTs `/whatsapp/agent/expenses`; and re-export `lookup_customer = search_customers`.

- [ ] **Step 1: Write the failing test**

Create `agents/nora/tests/test_expenses_tool.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch

from src.tools.expenses import create_expense


@pytest.mark.asyncio
async def test_create_expense_posts_to_agent_endpoint():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "exp_1", "status": "pendiente", "alreadyExisted": False})

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = await create_expense.ainvoke(
            {
                "expense_date": "2026-04-24",
                "category": "alimentacion",
                "amount": 25000,
                "description": "Almuerzo",
                "conversation_id": "conv_1",
                "auth_token": "Bearer scoped",
            }
        )

    fake_client.post.assert_awaited_once()
    path, payload = fake_client.post.await_args.args
    assert path == "/whatsapp/agent/expenses"
    assert payload["amount"] == 25000
    assert payload["conversationId"] == "conv_1"
    assert payload["category"] == "alimentacion"
    assert "exp_1" in result


@pytest.mark.asyncio
async def test_create_expense_reports_already_existed():
    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value={"id": "exp_9", "status": "pendiente", "alreadyExisted": True})
    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        result = await create_expense.ainvoke(
            {
                "expense_date": "2026-04-24",
                "category": "alimentacion",
                "amount": 1000,
                "description": "x",
                "conversation_id": "conv_1",
                "auth_token": "Bearer scoped",
            }
        )
    assert "ya estaba registrado" in result.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_expenses_tool.py -v`
Expected: FAIL — `ModuleNotFoundError: src.tools.expenses`.

- [ ] **Step 3: Implement the tool**

Create `agents/nora/src/tools/expenses.py`:

```python
import json
from typing import Annotated, Optional

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from .customers import search_customers
from .nestjs_client import NestJSClient, NestJSAPIError

# Reuse the existing customer search as the association lookup tool.
lookup_customer = search_customers


@tool
async def create_expense(
    expense_date: str,
    category: str,
    amount: float,
    description: str,
    conversation_id: Annotated[str, InjectedState("conversation_id")],
    auth_token: Annotated[str, InjectedState("auth_token")],
    supplier_name: Optional[str] = None,
    supplier_nit: Optional[str] = None,
    invoice_number: Optional[str] = None,
    payment_method: Optional[str] = None,
    customer_id: Optional[str] = None,
    visit_id: Optional[str] = None,
    extraction_confidence: Optional[float] = None,
    extraction_model: Optional[str] = None,
) -> str:
    """
    Registra el gasto comercial en el CRM usando el soporte (imagen) que ya
    fue recibido por WhatsApp. Llama esta herramienta SOLO cuando el usuario
    haya confirmado los datos del gasto.

    Args:
        expense_date: Fecha del gasto en formato YYYY-MM-DD.
        category: Categoria del gasto (ej: alimentacion, hospedaje, combustible, peajes, otros).
        amount: Valor total del gasto en pesos (numero, sin separadores).
        description: Descripcion corta del gasto.
        supplier_name / supplier_nit / invoice_number / payment_method: datos del soporte (opcionales).
        customer_id: Cliente a asociar (opcional; usa lookup_customer si el usuario lo menciona).
        visit_id: Visita a asociar (opcional).
        extraction_confidence / extraction_model: metadatos de la lectura OCR (opcionales).

    Returns:
        Confirmacion con el ID del gasto creado y su estado.
    """
    payload: dict = {
        "conversationId": conversation_id,
        "expenseDate": expense_date,
        "category": category,
        "amount": amount,
        "description": description,
    }
    optional = {
        "supplierName": supplier_name,
        "supplierNit": supplier_nit,
        "invoiceNumber": invoice_number,
        "paymentMethod": payment_method,
        "customerId": customer_id,
        "visitId": visit_id,
        "extractionConfidence": extraction_confidence,
        "extractionModel": extraction_model,
    }
    for key, value in optional.items():
        if value is not None:
            payload[key] = value

    try:
        client = NestJSClient(auth_token)
        result = await client.post("/whatsapp/agent/expenses", payload)
        expense_id = result.get("id", "desconocido")
        if result.get("alreadyExisted"):
            return f"Ese gasto ya estaba registrado (ID: {expense_id})."
        status = result.get("status", "pendiente")
        return (
            f"Gasto registrado exitosamente. ID: {expense_id}, estado: {status}. "
            f"Queda en revision. Detalle: {json.dumps(result, ensure_ascii=False)}"
        )
    except NestJSAPIError as e:
        return f"Error al registrar el gasto: {e.detail}"
    except Exception as e:
        return f"Error inesperado al registrar el gasto: {str(e)}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_expenses_tool.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/tools/expenses.py agents/nora/tests/test_expenses_tool.py
git commit -m "feat(nora): create_expense tool calling the WhatsApp agent endpoint"
```

---

## Task 8: Expense-flow system prompt

**Files:**
- Create: `agents/nora/src/prompts/expense_agent.py`

**Interfaces:**
- Produces: `EXPENSE_AGENT_PROMPT: str`.

- [ ] **Step 1: Create the prompt**

Create `agents/nora/src/prompts/expense_agent.py`:

```python
EXPENSE_AGENT_PROMPT = """Eres Nora, la asistente comercial de Norgtech, atendiendo a un comercial por WhatsApp para registrar un GASTO.

## Contexto que recibes
En el historial verás un bloque [CASO DE GASTO] con los datos que ya se leyeron del soporte (valor, fecha, categoria, proveedor, etc.), qué campos faltan, y si hay una imagen de soporte adjunta.

## Tu objetivo
Llevar el gasto desde "leído" hasta "registrado", de forma natural y breve.

## Reglas
1. Si faltan campos OBLIGATORIOS (valor/amount, fecha/expenseDate, categoria/category, descripcion/description), pídelos en lenguaje natural, sin enumerar como formulario. NO registres el gasto todavía.
2. Si ya tienes todos los obligatorios, resume los datos en una frase y pide confirmación una sola vez.
3. Interpreta la confirmación de forma flexible: "sí", "dale", "ok", "listo", "correcto", "lo veo bien", "está bien", "perfecto", "de una", etc. TODAS significan confirmar. No dependas de palabras exactas: entiende la intención.
4. Cuando el usuario confirme, llama a `create_expense` con los datos del caso (incluye extraction_confidence y extraction_model si están en el caso). El soporte ya está adjunto; no pidas la imagen de nuevo.
5. Tras registrar, confirma con naturalidad: el valor, que quedó registrado y que pasa a revisión. NO repitas "listo para revisión" sin haber registrado.
6. Si el usuario quiere asociar el gasto a un cliente o visita, usa `lookup_customer` para encontrar el id y pásalo como customer_id.
7. Si `create_expense` devuelve un error, explícalo de forma simple y di qué falta o qué corregir.

## Estilo
Español colombiano, "tú", cálida y al grano. No muestres JSON crudo al usuario.
"""
```

- [ ] **Step 2: Commit**

```bash
git add agents/nora/src/prompts/expense_agent.py
git commit -m "feat(nora): expense-flow system prompt"
```

---

## Task 9: Stateless WhatsApp agent runner + models

**Files:**
- Modify: `agents/nora/src/models/whatsapp_models.py:29-36` (add attachments) and end of file (new models)
- Create: `agents/nora/src/whatsapp_agent.py`
- Test: `agents/nora/tests/test_whatsapp_agent.py`

**Interfaces:**
- Consumes: `create_expense`, `lookup_customer` (Task 7); `EXPENSE_AGENT_PROMPT` (Task 8); `create_llm` (`agents/nora/src/agent.py`).
- Produces:
  - `NoraAgentAttachment(kind, providerMediaId?, fileName?, contentType?, caption?)`
  - `WhatsAppAgentRequest(history: list[NoraMessageContext], open_case: NoraOpenCaseContext|None, attachments: list[NoraAgentAttachment], sender: NoraUserContext|None, conversation_id: str|None, auth: str, current_message: str)`
  - `WhatsAppAgentResponse(reply_text: str, case_update: dict|None, executed_entity: dict|None)`
  - `async def run_whatsapp_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse`

- [ ] **Step 1: Add attachments to the open-case model and define agent models**

In `agents/nora/src/models/whatsapp_models.py`, add `attachments` to `NoraOpenCaseContext`:

```python
class NoraOpenCaseContext(BaseModel):
    id: str
    type: Literal["order", "new_customer", "expense"]
    status: str
    extractedData: dict[str, Any] = Field(default_factory=dict)
    missingFields: list[str] = Field(default_factory=list)
    lastQuestion: str | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
```

Append at the end of the file:

```python
class NoraAgentAttachment(BaseModel):
    kind: Literal["image", "document"]
    providerMediaId: str | None = None
    fileName: str | None = None
    contentType: str | None = None
    caption: str | None = None


class WhatsAppAgentRequest(BaseModel):
    current_message: str
    history: list[NoraMessageContext] = Field(default_factory=list)
    open_case: NoraOpenCaseContext | None = None
    attachments: list[NoraAgentAttachment] = Field(default_factory=list)
    sender: NoraUserContext | None = None
    conversation_id: str | None = None
    auth: str


class WhatsAppAgentResponse(BaseModel):
    reply_text: str
    case_update: dict[str, Any] | None = None
    executed_entity: dict[str, Any] | None = None
```

- [ ] **Step 2: Write the failing test**

Create `agents/nora/tests/test_whatsapp_agent.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch

from src.models.whatsapp_models import (
    NoraMessageContext,
    NoraOpenCaseContext,
    WhatsAppAgentRequest,
)
from src.whatsapp_agent import run_whatsapp_agent


def _expense_case():
    return NoraOpenCaseContext(
        id="case_1",
        type="expense",
        status="ready_for_review",
        extractedData={
            "amount": 25000,
            "expenseDate": "2026-04-24",
            "category": "alimentacion",
            "description": "Almuerzo",
            "supplierName": "INVERSIONES ARIAS SERNA S.A.S.",
            "extractionConfidence": 0.9,
            "extractionModel": "gpt-4.1-mini",
        },
        missingFields=[],
        attachments=[{"providerMediaId": "media_1", "kind": "image"}],
    )


@pytest.mark.asyncio
async def test_confirmation_phrase_triggers_expense_creation():
    request = WhatsAppAgentRequest(
        current_message="lo veo bien",
        history=[
            NoraMessageContext(role="assistant", body="Leí el soporte: valor $25.000... ¿lo registro?"),
            NoraMessageContext(role="user", body="lo veo bien"),
        ],
        open_case=_expense_case(),
        conversation_id="conv_1",
        auth="Bearer scoped",
    )

    create_calls = {}

    async def fake_post(path, payload):
        create_calls["path"] = path
        create_calls["payload"] = payload
        return {"id": "exp_1", "status": "pendiente", "alreadyExisted": False}

    fake_client = AsyncMock()
    fake_client.post = fake_post

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        response = await run_whatsapp_agent(request)

    assert create_calls["path"] == "/whatsapp/agent/expenses"
    assert create_calls["payload"]["amount"] == 25000
    assert response.executed_entity == {"type": "CommercialExpense", "id": "exp_1"}
    assert "25" in response.reply_text or "registr" in response.reply_text.lower()


@pytest.mark.asyncio
async def test_missing_amount_asks_instead_of_creating():
    case = _expense_case()
    case.extractedData.pop("amount")
    case.missingFields = ["amount"]
    request = WhatsAppAgentRequest(
        current_message="hola",
        history=[NoraMessageContext(role="user", body="hola")],
        open_case=case,
        conversation_id="conv_1",
        auth="Bearer scoped",
    )

    fake_client = AsyncMock()
    fake_client.post = AsyncMock()

    with patch("src.tools.expenses.NestJSClient", return_value=fake_client):
        response = await run_whatsapp_agent(request)

    fake_client.post.assert_not_called()
    assert response.executed_entity is None
    assert len(response.reply_text) > 0
```

> These tests exercise the real LLM. They require `OPENAI_API_KEY` (or the configured provider) in the environment and make network calls. If the executing environment has no model credentials, mark them with `@pytest.mark.integration` and run them in an env that does; do not stub the LLM, since correct intent interpretation is the whole point of this task.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_agent.py -v`
Expected: FAIL — `ModuleNotFoundError: src.whatsapp_agent`.

- [ ] **Step 4: Implement the runner**

Create `agents/nora/src/whatsapp_agent.py`:

```python
import json
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from .agent import create_llm
from .models.whatsapp_models import WhatsAppAgentRequest, WhatsAppAgentResponse
from .prompts.expense_agent import EXPENSE_AGENT_PROMPT
from .tools.expenses import create_expense, lookup_customer

EXPENSE_TOOLS = [lookup_customer, create_expense]


class _AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    auth_token: str
    conversation_id: str | None


def _build_expense_graph():
    llm = create_llm().bind_tools(EXPENSE_TOOLS)
    tool_node = ToolNode(EXPENSE_TOOLS)

    def call_model(state: _AgentState) -> dict:
        response = llm.invoke(state["messages"])
        return {"messages": [response]}

    def should_continue(state: _AgentState):
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return "__end__"

    workflow = StateGraph(_AgentState)
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "__end__": END})
    workflow.add_edge("tools", "agent")
    # No checkpointer: full history is passed in on every call (stateless).
    return workflow.compile()


_expense_graph = _build_expense_graph()


def _case_context_block(request: WhatsAppAgentRequest) -> str:
    case = request.open_case
    if not case:
        return "[CASO DE GASTO] No hay caso abierto."
    has_support = bool(case.attachments) or bool(request.attachments)
    return (
        "[CASO DE GASTO]\n"
        f"- estado: {case.status}\n"
        f"- datos leidos: {json.dumps(case.extractedData, ensure_ascii=False)}\n"
        f"- campos faltantes: {json.dumps(case.missingFields, ensure_ascii=False)}\n"
        f"- soporte adjunto: {'si' if has_support else 'no'}"
    )


def _to_messages(request: WhatsAppAgentRequest) -> list:
    messages: list = [
        SystemMessage(content=EXPENSE_AGENT_PROMPT),
        SystemMessage(content=_case_context_block(request)),
    ]
    for item in request.history:
        if item.role == "assistant":
            messages.append(AIMessage(content=item.body))
        else:
            messages.append(HumanMessage(content=item.body))
    # Ensure the current message is present as the last human turn.
    if not request.history or request.history[-1].body != request.current_message:
        messages.append(HumanMessage(content=request.current_message))
    return messages


def _extract_executed_entity(messages: list) -> dict | None:
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage) and msg.name == "create_expense":
            content = msg.content or ""
            try:
                start = content.index("{")
                data = json.loads(content[start:])
            except (ValueError, json.JSONDecodeError):
                continue
            if data.get("id") and not data.get("alreadyExisted"):
                return {"type": "CommercialExpense", "id": data["id"]}
    return None


async def run_whatsapp_agent(request: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    state: _AgentState = {
        "messages": _to_messages(request),
        "auth_token": request.auth,
        "conversation_id": request.conversation_id,
    }
    result = await _expense_graph.ainvoke(state)

    reply_text = ""
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            reply_text = msg.content
            break
    if not reply_text:
        reply_text = "¿Algo más con el gasto?"

    return WhatsAppAgentResponse(
        reply_text=reply_text,
        case_update=None,
        executed_entity=_extract_executed_entity(result["messages"]),
    )
```

> The `create_expense` tool reads `conversation_id` from `InjectedState`; the state key name (`conversation_id`) must match the `InjectedState("conversation_id")` annotation in Task 7. Keep them identical.

- [ ] **Step 5: Run test to verify it passes**

Run (in an env with model credentials): `cd agents/nora && python -m pytest tests/test_whatsapp_agent.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add agents/nora/src/whatsapp_agent.py agents/nora/src/models/whatsapp_models.py agents/nora/tests/test_whatsapp_agent.py
git commit -m "feat(nora): stateless WhatsApp expense agent runner"
```

---

## Task 10: Expose `POST /whatsapp/agent` on the Nora API

**Files:**
- Modify: `agents/nora/src/main.py:21-24,191-193`
- Test: `agents/nora/tests/test_whatsapp_agent_endpoint.py`

**Interfaces:**
- Consumes: `run_whatsapp_agent`, `WhatsAppAgentRequest`, `WhatsAppAgentResponse` (Task 9).
- Produces: `POST /whatsapp/agent` → `WhatsAppAgentResponse`.

- [ ] **Step 1: Write the failing test**

Create `agents/nora/tests/test_whatsapp_agent_endpoint.py`:

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.main import app
from src.models.whatsapp_models import WhatsAppAgentResponse


def test_whatsapp_agent_endpoint_returns_reply():
    client = TestClient(app)

    async def fake_run(request):
        return WhatsAppAgentResponse(
            reply_text="Listo, registré el gasto.",
            case_update=None,
            executed_entity={"type": "CommercialExpense", "id": "exp_1"},
        )

    with patch("src.main.run_whatsapp_agent", side_effect=fake_run):
        response = client.post(
            "/whatsapp/agent",
            json={
                "current_message": "lo veo bien",
                "history": [],
                "auth": "Bearer scoped",
                "conversation_id": "conv_1",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["reply_text"] == "Listo, registré el gasto."
    assert body["executed_entity"]["id"] == "exp_1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_agent_endpoint.py -v`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Add the route**

In `agents/nora/src/main.py`, extend the imports from `whatsapp_models` and `whatsapp_agent`:

```python
from .models.whatsapp_models import (
    WhatsAppRouteRequest,
    WhatsAppRouteResponse,
    WhatsAppAgentRequest,
    WhatsAppAgentResponse,
)
from .whatsapp_agent import run_whatsapp_agent
```

After the existing `whatsapp_route` endpoint, add:

```python
@app.post("/whatsapp/agent", response_model=WhatsAppAgentResponse)
async def whatsapp_agent(payload: WhatsAppAgentRequest) -> WhatsAppAgentResponse:
    return await run_whatsapp_agent(payload)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/nora && python -m pytest tests/test_whatsapp_agent_endpoint.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agents/nora/src/main.py agents/nora/tests/test_whatsapp_agent_endpoint.py
git commit -m "feat(nora): POST /whatsapp/agent endpoint"
```

---

## Task 11: Route expense-flow turns to the agent (with planner fallback)

**Files:**
- Modify: `apps/api/src/modules/whatsapp/nora-routing.service.ts:45-186,232-244,509-546`
- Test: `apps/api/src/modules/whatsapp/nora-routing.service.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `AuthService.mintScopedToken` (Task 3), `NoraCaseService.findOpenCase`, the Nora `POST /whatsapp/agent` endpoint (Task 10).
- Produces: private `isExpenseFlowTurn(...)`, private `requestNoraAgent(payload)`, and a branch in `routeInboundMessage` that, when the flag is on and the turn is expense-flow, calls the agent, sends `reply_text`, applies `case_update`, and on any error falls back to the existing planner path.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/whatsapp/nora-routing.service.spec.ts`. Test the decision + fallback logic in isolation:

```typescript
import { NoraRoutingService } from "./nora-routing.service";

describe("NoraRoutingService expense-agent branch", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, NORA_WHATSAPP_AGENT_EXPENSES: "true" };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  function makeService() {
    const authService = { mintScopedToken: jest.fn().mockResolvedValue("scoped") };
    const noraCaseService = { findOpenCase: jest.fn().mockResolvedValue(null) };
    const service = new NoraRoutingService(
      {} as never, // prisma
      {} as never, // whatsAppService
      {} as never, // orderAutomation
      noraCaseService as never,
      {} as never, // expenseExtraction
      authService as never,
    );
    return { service, authService, noraCaseService };
  }

  it("treats commercial + media as an expense-flow turn", () => {
    const { service } = makeService();
    const result = (service as never as {
      isExpenseFlowTurn: (s: string, hasMedia: boolean, openCaseType?: string) => boolean;
    }).isExpenseFlowTurn("comercial", true, undefined);
    expect(result).toBe(true);
  });

  it("treats an open expense case as an expense-flow turn", () => {
    const { service } = makeService();
    const result = (service as never as {
      isExpenseFlowTurn: (s: string, hasMedia: boolean, openCaseType?: string) => boolean;
    }).isExpenseFlowTurn("comercial", false, "expense");
    expect(result).toBe(true);
  });

  it("does not treat a client text message as expense-flow", () => {
    const { service } = makeService();
    const result = (service as never as {
      isExpenseFlowTurn: (s: string, hasMedia: boolean, openCaseType?: string) => boolean;
    }).isExpenseFlowTurn("cliente", false, undefined);
    expect(result).toBe(false);
  });
});
```

> Match the real `NoraRoutingService` constructor parameter order exactly — read its constructor and align both the `new NoraRoutingService(...)` args here and the injected `AuthService` added in Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/modules/whatsapp/nora-routing.service.spec.ts`
Expected: FAIL — `isExpenseFlowTurn is not a function` (and/or constructor arity mismatch).

- [ ] **Step 3: Inject `AuthService` and add the helpers**

In `nora-routing.service.ts`:

1. Import and inject `AuthService` (add to the constructor params; `AuthModule` is already imported by `WhatsAppModule`):

```typescript
import { AuthService } from "../auth/auth.service";
// ...constructor(..., private readonly authService: AuthService) {}
```

2. Add the flow detector and the agent caller:

```typescript
private isExpenseFlowTurn(
  senderType: string,
  hasMedia: boolean,
  openCaseType?: string,
): boolean {
  if (process.env.NORA_WHATSAPP_AGENT_EXPENSES !== "true") {
    return false;
  }
  if (openCaseType === "expense") {
    return true;
  }
  return senderType === "comercial" && hasMedia;
}

private async requestNoraAgent(payload: Record<string, unknown>) {
  const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
  const response = await fetch(`${noraApiUrl}/whatsapp/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Nora agent request failed with status ${response.status}`);
  }
  return response.json() as Promise<{
    reply_text: string;
    case_update: Record<string, unknown> | null;
    executed_entity: Record<string, unknown> | null;
  }>;
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd apps/api && npx jest src/modules/whatsapp/nora-routing.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Wire the branch into `routeInboundMessage`**

Inside `routeInboundMessage`, after `sender` is resolved and the open case is known but **before** the existing `requestNoraRoute(...)` call, insert the agent branch. (Read the surrounding code to bind the real variable names for the resolved user id, the open case, and `message`/media; the snippet below uses the names this plan has referenced.)

```typescript
const openCase = await this.noraCaseService.findOpenCase(conversation.id);
const hasMedia = Boolean(/* the inbound media flag already computed in this method */);

if (
  sender.userId &&
  this.isExpenseFlowTurn(sender.senderType, hasMedia, openCase?.type)
) {
  try {
    const scopedToken = await this.authService.mintScopedToken(sender.userId);
    const agentResponse = await this.requestNoraAgent({
      current_message: message.body,
      history: recentMessages, // the same recent_messages array built for the planner payload
      open_case: openCase
        ? {
            id: openCase.id,
            type: openCase.type,
            status: openCase.status,
            extractedData: openCase.extractedData,
            missingFields: openCase.missingFields,
            lastQuestion: openCase.lastQuestion,
            attachments: openCase.attachments,
          }
        : null,
      conversation_id: conversation.id,
      auth: `Bearer ${scopedToken}`,
    });

    if (agentResponse.reply_text) {
      await this.whatsAppService.sendAgentReply(conversation.id, agentResponse.reply_text);
    }
    if (agentResponse.case_update && openCase) {
      await this.noraCaseService.updateCase(openCase.id, agentResponse.case_update);
    }
    return; // handled by the agent
  } catch (error) {
    this.logger.error?.(
      `Nora agent expense flow failed, falling back to planner: ${String(error)}`,
    );
    // fall through to the planner path below
  }
}
```

> `executed_entity` does not need a separate write-back here: the `/whatsapp/agent/expenses` endpoint (Task 5) already marks the case `executed` atomically. The branch only needs to deliver the reply and persist any non-execution `case_update` (e.g. updated `missingFields` while still collecting). If `routeInboundMessage` lacks a `logger`, use the existing logging mechanism in the file.

- [ ] **Step 6: Type-check and run the whatsapp suite**

Run: `cd apps/api && npx tsc --noEmit && npx jest src/modules/whatsapp`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-routing.service.ts apps/api/src/modules/whatsapp/nora-routing.service.spec.ts
git commit -m "feat(whatsapp): route expense-flow turns to the LLM agent with planner fallback"
```

---

## Task 12: End-to-end scenario test (the screenshot, fixed)

**Files:**
- Test: `apps/api/src/modules/whatsapp/nora-expense-execution.service.spec.ts` (extend) OR a new `*.e2e-spec.ts` if the repo has an e2e harness.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the scenario test**

Append to `apps/api/src/modules/whatsapp/nora-expense-execution.service.spec.ts` a test that mirrors the transcript: a `ready_for_review` expense case with an OCR'd amount and a kapso image attachment, executed once, produces a `pendiente` expense and an `executed` case; executed a second time returns `alreadyExisted: true` and does not create a duplicate.

```typescript
describe("scenario: receipt -> confirm -> expense created (idempotent)", () => {
  it("creates once and is idempotent on re-confirm", async () => {
    const created = { id: "exp_1", status: "pendiente" };
    let storedExecutedId: string | null = null;

    const noraCaseService = {
      findOpenCase: jest.fn().mockImplementation(async () => ({
        id: "case_1",
        type: "expense",
        status: storedExecutedId ? "executed" : "ready_for_review",
        attachments: [
          { provider: "kapso", kind: "image", providerMediaId: "media_1", contentType: "image/jpeg" },
        ],
        executedEntityId: storedExecutedId,
      })),
      updateCase: jest.fn().mockImplementation(async (_id, input) => {
        if (input.executedEntityId) storedExecutedId = input.executedEntityId;
      }),
    };
    const expensesService = { createFromBuffer: jest.fn().mockResolvedValue(created) };
    const whatsAppService = { downloadMedia: jest.fn().mockResolvedValue(Buffer.from("img")) };
    const prisma = {
      whatsAppConversation: {
        findUnique: jest.fn().mockResolvedValue({ account: { phoneNumberId: "pn_1" } }),
      },
    };
    const { NoraExpenseExecutionService } = await import("./nora-expense-execution.service");
    const service = new NoraExpenseExecutionService(
      noraCaseService as never,
      expensesService as never,
      whatsAppService as never,
      prisma as never,
    );

    const dto = {
      expenseDate: "2026-04-24",
      category: "alimentacion",
      amount: 25000,
      description: "Almuerzo",
    } as never;

    const first = await service.executeFromWhatsApp({ user: { id: "u" } as never, conversationId: "conv_1", dto });
    const second = await service.executeFromWhatsApp({ user: { id: "u" } as never, conversationId: "conv_1", dto });

    expect(first).toEqual({ id: "exp_1", status: "pendiente", alreadyExisted: false });
    expect(second.alreadyExisted).toBe(true);
    expect(expensesService.createFromBuffer).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/api && npx jest src/modules/whatsapp/nora-expense-execution.service.spec.ts`
Expected: PASS

- [ ] **Step 3: Full backend + Nora suites green**

Run: `cd apps/api && npx jest src/modules/whatsapp src/modules/commercial-expenses src/modules/auth`
Run: `cd agents/nora && python -m pytest tests/test_expenses_tool.py tests/test_whatsapp_agent_endpoint.py -v`
Expected: PASS (the live-LLM `test_whatsapp_agent.py` runs in an env with model credentials).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/whatsapp/nora-expense-execution.service.spec.ts
git commit -m "test(whatsapp): end-to-end expense confirmation scenario"
```

---

## Manual verification (after all tasks)

1. Set `NORA_WHATSAPP_AGENT_EXPENSES=true`, `NORA_API_URL`, `NESTJS_API_URL`, and model credentials.
2. Start the Nora service and the NestJS API.
3. From a commercial WhatsApp number: send a receipt photo → expect the OCR summary asking to confirm.
4. Reply "lo veo bien" → expect "registré el gasto … queda en revisión" with an ID, **not** the greeting menu.
5. Confirm in the DB: a `CommercialExpense` exists with status `pendiente`, and the `NoraConversationCase` is `executed` with `executedEntityType=CommercialExpense` and `executedEntityId` set.
6. Reply "lo veo bien" again → expect "ese gasto ya estaba registrado" and no duplicate row.
7. Send a receipt with no readable amount → expect Nora to ask for the value, and no expense created until provided.

---

## Self-Review Notes

- **Spec coverage:** Routing branch (Task 11), stateless agent endpoint (Tasks 9–10), expense tools (Task 7), auth bridge (Task 3), attachment linking without re-upload (Tasks 2 + 4), reply + case write-back (Tasks 1, 4, 11), error/fallback + idempotency (Tasks 4, 11), tests incl. varied confirmation phrasings and missing-amount (Tasks 7, 9, 12). OCR stays in NestJS (unchanged) and reaches the agent via `open_case.extractedData` (Task 9 context block). Out-of-scope flows untouched (planner path preserved by the flag + fallback).
- **State key consistency:** `create_expense` reads `InjectedState("conversation_id")` (Task 7) and the graph state defines `conversation_id` (Task 9) — identical.
- **Type consistency:** `createFromBuffer` / `ExpenseBufferFile` (Task 2) consumed verbatim in Task 4; `mintScopedToken` (Task 3) consumed in Task 11; `executeFromWhatsApp`/`ExecuteExpenseResult` (Task 4) consumed in Task 5; `executedEntityType`/`executedEntityId` added in Task 1 and used in Tasks 4 & 11.
- **Constructor arity caveat:** Tasks 4, 5, and 11 instantiate services directly in unit tests. Each such step instructs the implementer to read the real constructor and align argument order — the single most likely source of a mechanical test failure.
