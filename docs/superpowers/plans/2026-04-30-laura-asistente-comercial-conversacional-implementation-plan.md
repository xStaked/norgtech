# Laura Asistente Comercial Conversacional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `Laura`, a conversational assistant inside the CRM that lets sales reps report free-form updates, resolve customer/opportunity context, confirm editable structured results, save approved blocks partially, and answer day-priority agenda queries.

**Architecture:** Add a dedicated `laura` backend module in Nest that orchestrates conversation state, structured extraction, CRM context resolution, proposal generation, and partial persistence on top of existing `customers`, `opportunities`, `visits`, and `follow-up-tasks` modules. Add a matching web experience in Next with one free-form report page plus contextual entry points in customer and opportunity detail pages, reusing the current visual system and agenda primitives.

**Tech Stack:** Next.js App Router, React 19, NestJS 11, Prisma, PostgreSQL, Jest e2e tests, Playwright e2e tests.

---

## Scope Check

This plan stays within one coherent subsystem: a conversational reporting and agenda assistant for the existing CRM. It avoids external WhatsApp operation, voice input, autonomous task generation, and persistent learning from corrections, which are all explicitly out of V1 scope.

## File Structure

### Backend

- Create: `apps/api/src/modules/laura/laura.module.ts`
- Create: `apps/api/src/modules/laura/laura.controller.ts`
- Create: `apps/api/src/modules/laura/laura.service.ts`
- Create: `apps/api/src/modules/laura/laura.types.ts`
- Create: `apps/api/src/modules/laura/laura-session.service.ts`
- Create: `apps/api/src/modules/laura/laura-context-resolver.service.ts`
- Create: `apps/api/src/modules/laura/laura-agenda.service.ts`
- Create: `apps/api/src/modules/laura/laura-persistence.service.ts`
- Create: `apps/api/src/modules/laura/laura-llm.service.ts`
- Create: `apps/api/src/modules/laura/dto/create-message.dto.ts`
- Create: `apps/api/src/modules/laura/dto/confirm-proposal.dto.ts`
- Create: `apps/api/src/modules/laura/dto/query-session.dto.ts`
- Create: `apps/api/src/modules/laura/prompts/laura-system-prompt.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_laura_conversation_tables/migration.sql`
- Create: `apps/api/test/laura.e2e-spec.ts`

### Web

- Create: `apps/web/src/app/(app)/laura/page.tsx`
- Create: `apps/web/src/components/laura/laura-chat.tsx`
- Create: `apps/web/src/components/laura/laura-message-list.tsx`
- Create: `apps/web/src/components/laura/laura-composer.tsx`
- Create: `apps/web/src/components/laura/laura-proposal-card.tsx`
- Create: `apps/web/src/components/laura/laura-proposal-block.tsx`
- Create: `apps/web/src/components/laura/laura-entry-card.tsx`
- Create: `apps/web/src/components/laura/laura-context-launcher.tsx`
- Create: `apps/web/src/components/laura/laura-types.ts`
- Modify: `apps/web/src/components/sidebar-nav.tsx`
- Modify: `apps/web/src/app/(app)/customers/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/opportunities/[id]/page.tsx`
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/middleware.ts`
- Create: `apps/web/tests/e2e/laura.spec.ts`

### Shared responsibilities

- `laura.service.ts`: public orchestration entry point for message handling and confirmation flows.
- `laura-session.service.ts`: conversation/session creation, message persistence, in-session memory retrieval.
- `laura-context-resolver.service.ts`: customer/opportunity/contact/date resolution and ambiguity detection.
- `laura-agenda.service.ts`: fetch, normalize, and prioritize existing visits and follow-up tasks for agenda queries.
- `laura-persistence.service.ts`: translate approved proposal blocks into existing CRM writes with audit-safe service calls.
- `laura-llm.service.ts`: provider abstraction; can start with one provider but must hide prompt and response parsing behind a stable interface for tests.

## Delivery Strategy

Ship Laura in five increments:

1. Conversation data model and API contract
2. Message interpretation and context resolution
3. Partial persistence into CRM records
4. Web chat and editable confirmation flow
5. Agenda query mode and contextual launch points

## Task 1: Add Laura data model and API module shell

**Files:**
- Create: `apps/api/src/modules/laura/laura.module.ts`
- Create: `apps/api/src/modules/laura/laura.controller.ts`
- Create: `apps/api/src/modules/laura/laura.service.ts`
- Create: `apps/api/src/modules/laura/laura.types.ts`
- Create: `apps/api/src/modules/laura/dto/create-message.dto.ts`
- Create: `apps/api/src/modules/laura/dto/confirm-proposal.dto.ts`
- Create: `apps/api/src/modules/laura/dto/query-session.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_laura_conversation_tables/migration.sql`
- Test: `apps/api/test/laura.e2e-spec.ts`

- [ ] **Step 1: Write failing backend tests for session creation and message submission**

Add Jest e2e coverage for:
- `POST /laura/messages` creates a conversation when no `sessionId` is sent
- free-form report message returns a structured proposal payload
- ambiguous customer result returns a clarification payload and does not create CRM records yet

Use the same style as [apps/api/test/follow-up-tasks.e2e-spec.ts](/Users/xstaked/Desktop/projects/norgtech-CRM/apps/api/test/follow-up-tasks.e2e-spec.ts:1): stub Prisma, boot `AppModule`, authenticate with existing `/auth/login`.

- [ ] **Step 2: Run the test and verify it fails because the module and routes do not exist**

Run:

```bash
pnpm --filter @norgtech/api test -- laura.e2e-spec.ts
```

Expected:
- test suite fails with 404 or missing module/controller errors

- [ ] **Step 3: Extend Prisma schema with conversation and proposal state tables**

Add the minimum persistent state for V1:

```prisma
enum LauraMessageRole {
  user
  assistant
  system
}

enum LauraMessageKind {
  report
  agenda_query
  clarification
  proposal
}

enum LauraProposalStatus {
  draft
  confirmed
  discarded
}

model LauraSession {
  id              String         @id @default(cuid())
  ownerUserId     String
  contextType     String?
  contextEntityId String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  messages        LauraMessage[]
  proposals       LauraProposal[]
}

model LauraMessage {
  id         String           @id @default(cuid())
  sessionId  String
  role       LauraMessageRole
  kind       LauraMessageKind
  content    String
  payload    Json?
  createdAt  DateTime         @default(now())
  session    LauraSession     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model LauraProposal {
  id         String               @id @default(cuid())
  sessionId  String
  messageId  String
  status     LauraProposalStatus  @default(draft)
  payload    Json
  createdAt  DateTime             @default(now())
  updatedAt  DateTime             @updatedAt
  session    LauraSession         @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}
```

Keep proposal payload in `Json` for V1 to avoid premature schema sprawl while the UI and extraction contract stabilize.

- [ ] **Step 4: Add Laura DTOs and public response contract**

Define request/response types in `laura.types.ts` so both controller and tests use one contract:

```ts
export type LauraAssistantResponse =
  | {
      mode: "clarification";
      sessionId: string;
      message: string;
      clarification: {
        type: "customer" | "opportunity" | "date" | "action";
        options?: Array<{ id: string; label: string }>;
      };
    }
  | {
      mode: "proposal";
      sessionId: string;
      message: string;
      proposalId: string;
      proposal: LauraProposalPayload;
    }
  | {
      mode: "agenda";
      sessionId: string;
      message: string;
      agenda: LauraAgendaPayload;
    };
```

- [ ] **Step 5: Add module shell and controller endpoints**

Create the initial endpoints:

```ts
@Controller("laura")
export class LauraController {
  constructor(private readonly lauraService: LauraService) {}

  @Post("messages")
  sendMessage(@CurrentUser() user: AuthUser, @Body() dto: CreateMessageDto) {
    return this.lauraService.handleMessage(user, dto);
  }

  @Post("proposals/:proposalId/confirm")
  confirmProposal(
    @CurrentUser() user: AuthUser,
    @Param("proposalId") proposalId: string,
    @Body() dto: ConfirmProposalDto,
  ) {
    return this.lauraService.confirmProposal(user, proposalId, dto);
  }

  @Get("sessions/:sessionId")
  getSession(@CurrentUser() user: AuthUser, @Param("sessionId") sessionId: string) {
    return this.lauraService.getSession(user, sessionId);
  }
}
```

- [ ] **Step 6: Run backend tests and make the initial module pass**

Run:

```bash
pnpm --filter @norgtech/api test -- laura.e2e-spec.ts
```

Expected:
- routes exist
- empty or stubbed orchestration path returns deterministic test payloads

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/modules/laura apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/test/laura.e2e-spec.ts
git commit -m "feat(api): scaffold Laura conversation module"
```

## Task 2: Implement session memory, message persistence, and context resolution

**Files:**
- Create: `apps/api/src/modules/laura/laura-session.service.ts`
- Create: `apps/api/src/modules/laura/laura-context-resolver.service.ts`
- Modify: `apps/api/src/modules/laura/laura.service.ts`
- Test: `apps/api/test/laura.e2e-spec.ts`

- [ ] **Step 1: Write failing tests for context resolution and follow-up messages**

Add backend tests for:
- fuzzy customer match from free-form text
- ambiguity returns two candidate customers
- second message like `si, el primero` uses the session clarification context
- contextual launch from customer detail still allows suggesting a different customer when the text clearly names another

- [ ] **Step 2: Run the tests and confirm they fail on missing resolution behavior**

Run:

```bash
pnpm --filter @norgtech/api test -- laura.e2e-spec.ts
```

Expected:
- failures on ambiguous/no-memory scenarios

- [ ] **Step 3: Implement session memory retrieval and append-only message persistence**

`laura-session.service.ts` should provide:

```ts
async ensureSession(userId: string, input?: { sessionId?: string; contextType?: string; contextEntityId?: string })
async appendUserMessage(sessionId: string, kind: LauraMessageKind, content: string, payload?: Prisma.JsonValue)
async appendAssistantMessage(sessionId: string, kind: LauraMessageKind, content: string, payload?: Prisma.JsonValue)
async getRecentMessages(sessionId: string, limit = 12)
async getLatestPendingClarification(sessionId: string)
async getLatestDraftProposal(sessionId: string)
```

Do not build cross-session memory in V1.

- [ ] **Step 4: Implement deterministic CRM context resolution**

`laura-context-resolver.service.ts` should:
- normalize free text to lowercase and strip punctuation
- match `customer.displayName`, `customer.legalName`, and `contact.fullName`
- prefer exact display-name matches over partial matches
- return `resolved`, `ambiguous`, or `unresolved`
- include candidate labels the UI can show directly

Core return shape:

```ts
type ResolvedCustomer =
  | { status: "resolved"; customerId: string; confidence: "high" | "medium" }
  | { status: "ambiguous"; options: Array<{ customerId: string; label: string }> }
  | { status: "unresolved" };
```

- [ ] **Step 5: Wire session memory into message handling**

`laura.service.ts` should:
- detect whether the incoming message answers a pending clarification
- reuse the prior pending clarification to resolve `si, el primero` / `el segundo`
- preserve the current contextual hint passed from customer/opportunity pages
- keep the response conversational but short

- [ ] **Step 6: Re-run backend tests and verify all memory/resolution cases pass**

Run:

```bash
pnpm --filter @norgtech/api test -- laura.e2e-spec.ts
```

Expected:
- customer ambiguity tests pass
- follow-up clarification test passes

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/laura apps/api/test/laura.e2e-spec.ts
git commit -m "feat(api): add Laura session memory and context resolution"
```

## Task 3: Add extraction, proposal generation, and partial persistence into CRM records

**Files:**
- Create: `apps/api/src/modules/laura/laura-persistence.service.ts`
- Create: `apps/api/src/modules/laura/laura-llm.service.ts`
- Create: `apps/api/src/modules/laura/prompts/laura-system-prompt.ts`
- Modify: `apps/api/src/modules/laura/laura.service.ts`
- Modify: `apps/api/src/modules/opportunities/opportunities.service.ts`
- Modify: `apps/api/src/modules/follow-up-tasks/follow-up-tasks.service.ts`
- Modify: `apps/api/src/modules/visits/visits.service.ts`
- Test: `apps/api/test/laura.e2e-spec.ts`

- [ ] **Step 1: Write failing tests for proposal generation and partial confirmation**

Cover:
- free-form report yields proposal blocks `interaction`, `opportunity`, `followUp`, `task`, `signals`
- confirming only `interaction` and `followUp` persists those blocks without touching opportunity stage
- rejecting one block does not fail the whole confirmation
- agenda query returns prioritized existing tasks/visits and does not create records

- [ ] **Step 2: Run tests and confirm failures**

Run:

```bash
pnpm --filter @norgtech/api test -- laura.e2e-spec.ts
```

Expected:
- confirmation endpoint fails or returns incomplete payloads

- [ ] **Step 3: Add provider abstraction for extraction**

`laura-llm.service.ts` should expose:

```ts
export interface LauraExtractionResult {
  intent: "report" | "agenda_query";
  customerName?: string;
  contactName?: string;
  interactionSummary?: string;
  suggestedOpportunityTitle?: string;
  suggestedOpportunityStage?: OpportunityStage;
  suggestedNextStep?: string;
  suggestedFollowUpDate?: string;
  suggestedTaskTitle?: string;
  taskType?: FollowUpTaskType;
  signals?: { objections?: string[]; risk?: string; buyingIntent?: string };
}

async extract(input: { message: string; contextSummary?: string; recentMessages: string[] }): Promise<LauraExtractionResult>
```

Implementation rules:
- keep the provider behind one service
- parse provider output into strict server-side types
- throw a controlled `BadRequestException` when the provider returns malformed JSON
- for tests, inject a fake extractor with deterministic outputs

- [ ] **Step 4: Build proposal payload shape for editable UI blocks**

Use one normalized payload:

```ts
export interface LauraProposalPayload {
  blocks: {
    interaction?: { enabled: boolean; summary: string; rawMessage: string };
    opportunity?: { enabled: boolean; opportunityId?: string; createNew?: boolean; title?: string; stage?: OpportunityStage };
    followUp?: { enabled: boolean; title: string; dueAt: string; opportunityId?: string; type: FollowUpTaskType };
    task?: { enabled: boolean; title: string; dueAt?: string; notes?: string };
    signals?: { enabled: boolean; objections: string[]; risk?: string; buyingIntent?: string };
  };
}
```

Keep `enabled` booleans so the client can discard blocks without reshaping the payload.

- [ ] **Step 5: Implement partial persistence**

`laura-persistence.service.ts` should accept confirmed block selections:

```ts
async persistApprovedBlocks(
  user: AuthUser,
  proposal: LauraProposalPayload,
  confirmation: ConfirmProposalDto,
): Promise<{
  saved: string[];
  discarded: string[];
  createdIds: Record<string, string>;
}>
```

Persistence rules for V1:
- always create a `Visit` record as the base interaction when `interaction` is approved
- create a `FollowUpTask` only when the block is approved
- update opportunity stage only when the block is approved and `opportunityId` resolves
- if `opportunity.createNew` is true and approved, create a new opportunity first
- store `signals` inside `Visit.notes` or structured appended text for V1 if the schema has no dedicated fields yet

Prefer using existing services where practical so audit logging remains consistent.

- [ ] **Step 6: Extend existing domain services only where orchestration needs narrower helpers**

If the current services are too route-centric, add narrow helper methods instead of bypassing them:
- `OpportunitiesService.createFromLaura(...)`
- `OpportunitiesService.updateStageFromLaura(...)`
- `FollowUpTasksService.createFromLaura(...)`
- `VisitsService.createFromLaura(...)`

Keep validation and audit writes in those services.

- [ ] **Step 7: Re-run backend tests and verify proposal/confirmation behavior**

Run:

```bash
pnpm --filter @norgtech/api test -- laura.e2e-spec.ts
pnpm --filter @norgtech/api test -- follow-up-tasks.e2e-spec.ts
```

Expected:
- Laura tests pass
- existing follow-up task coverage still passes

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/laura apps/api/src/modules/opportunities/opportunities.service.ts apps/api/src/modules/follow-up-tasks/follow-up-tasks.service.ts apps/api/src/modules/visits/visits.service.ts apps/api/test/laura.e2e-spec.ts
git commit -m "feat(api): add Laura proposal generation and partial persistence"
```

## Task 4: Add agenda query service and prioritization rules

**Files:**
- Create: `apps/api/src/modules/laura/laura-agenda.service.ts`
- Modify: `apps/api/src/modules/laura/laura.service.ts`
- Test: `apps/api/test/laura.e2e-spec.ts`

- [ ] **Step 1: Write failing tests for agenda query responses**

Cover:
- `que tengo pendiente hoy` returns visits and follow-ups already in CRM
- response is ordered with overdue tasks first, then due-today tasks, then today visits, then upcoming same-day items
- no new follow-ups or visits are created from agenda questions

- [ ] **Step 2: Run tests and confirm agenda query ordering fails**

Run:

```bash
pnpm --filter @norgtech/api test -- laura.e2e-spec.ts
```

- [ ] **Step 3: Implement a dedicated agenda aggregation service**

`laura-agenda.service.ts` should reuse the same primitives as [apps/web/src/app/(app)/agenda/page.tsx](/Users/xstaked/Desktop/projects/norgtech-CRM/apps/web/src/app/(app)/agenda/page.tsx:1), but centralize the logic server-side for Laura:

```ts
async getAgendaForToday(userId: string): Promise<LauraAgendaPayload>
```

Output should contain:
- `summary`: counts of overdue, due today, and visits today
- `priorityItems`: top suggested items in order
- `allItems`: normalized list for optional expanded UI

- [ ] **Step 4: Add simple, explainability-free prioritization**

Prioritization rules for V1:
- overdue pending follow-ups
- pending follow-ups due today
- scheduled visits happening today
- remaining pending this-week items

Do not generate long explanations. The assistant message should simply present the ordered result.

- [ ] **Step 5: Re-run tests**

Run:

```bash
pnpm --filter @norgtech/api test -- laura.e2e-spec.ts
```

Expected:
- agenda query tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/laura apps/api/test/laura.e2e-spec.ts
git commit -m "feat(api): add Laura agenda query mode"
```

## Task 5: Build Laura chat UI and proposal confirmation flow

**Files:**
- Create: `apps/web/src/app/(app)/laura/page.tsx`
- Create: `apps/web/src/components/laura/laura-chat.tsx`
- Create: `apps/web/src/components/laura/laura-message-list.tsx`
- Create: `apps/web/src/components/laura/laura-composer.tsx`
- Create: `apps/web/src/components/laura/laura-proposal-card.tsx`
- Create: `apps/web/src/components/laura/laura-proposal-block.tsx`
- Create: `apps/web/src/components/laura/laura-entry-card.tsx`
- Create: `apps/web/src/components/laura/laura-types.ts`
- Modify: `apps/web/src/components/sidebar-nav.tsx`
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/middleware.ts`
- Test: `apps/web/tests/e2e/laura.spec.ts`

- [ ] **Step 1: Write failing Playwright coverage for the standalone Laura page**

Cover:
- sidebar contains `Laura`
- `/laura` loads for allowed roles
- user can type a free-form message
- assistant response renders conversational text plus proposal card blocks
- user can disable one block and confirm the rest

- [ ] **Step 2: Run Playwright and confirm failures**

Run:

```bash
pnpm --filter @norgtech/web test:e2e -- laura.spec.ts
```

Expected:
- route and selectors not found

- [ ] **Step 3: Add Laura page and base chat layout**

The page should follow the existing CRM shell and UI patterns:
- top `PageHeader`
- short helper copy
- conversation panel
- composer fixed at the bottom of the card on desktop

Do not build a generic chatbot shell; keep it aligned with CRM surfaces and spacing.

- [ ] **Step 4: Build proposal blocks as compact editable sections**

`laura-proposal-card.tsx` should render blocks:
- customer/context
- interaction
- opportunity
- follow-up
- task
- signals

Each block needs:
- enabled/disabled toggle
- inline field edits
- clear visual separation

Favor compact sections over modal-heavy editing.

- [ ] **Step 5: Add API integration**

Use `apiFetchClient` to call:
- `POST /laura/messages`
- `POST /laura/proposals/:proposalId/confirm`
- `GET /laura/sessions/:sessionId`

Persist `sessionId` in component state only for V1.

- [ ] **Step 6: Re-run Playwright tests**

Run:

```bash
pnpm --filter @norgtech/web test:e2e -- laura.spec.ts
```

Expected:
- standalone Laura flow passes

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(app)/laura apps/web/src/components/laura apps/web/src/components/sidebar-nav.tsx apps/web/src/lib/auth.ts apps/web/src/middleware.ts apps/web/tests/e2e/laura.spec.ts
git commit -m "feat(web): add Laura chat and proposal confirmation UI"
```

## Task 6: Add Laura contextual entry points in customer and opportunity views

**Files:**
- Create: `apps/web/src/components/laura/laura-context-launcher.tsx`
- Modify: `apps/web/src/app/(app)/customers/[id]/page.tsx`
- Modify: `apps/web/src/app/(app)/opportunities/[id]/page.tsx`
- Test: `apps/web/tests/e2e/laura.spec.ts`

- [ ] **Step 1: Write failing Playwright coverage for contextual launch**

Cover:
- customer detail page shows a `Hablar con Laura` entry point
- opportunity detail page shows the same
- launching from context opens the Laura experience with context hint attached
- if the user names a different customer in the message, the assistant can still ask to switch

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @norgtech/web test:e2e -- laura.spec.ts
```

- [ ] **Step 3: Add compact launcher components to detail pages**

Add a reusable `LauraContextLauncher` that passes:

```ts
{
  contextType: "customer" | "opportunity",
  contextEntityId: string,
  contextLabel: string
}
```

Prefer an inline card or secondary action near existing page actions, not a floating global widget.

- [ ] **Step 4: Re-run Playwright**

Run:

```bash
pnpm --filter @norgtech/web test:e2e -- laura.spec.ts
```

Expected:
- contextual launch coverage passes

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/laura/laura-context-launcher.tsx apps/web/src/app/(app)/customers/[id]/page.tsx apps/web/src/app/(app)/opportunities/[id]/page.tsx apps/web/tests/e2e/laura.spec.ts
git commit -m "feat(web): add Laura entry points to customer and opportunity pages"
```

## Task 7: Integration hardening, permissions, and regression coverage

**Files:**
- Modify: `apps/api/test/laura.e2e-spec.ts`
- Modify: `apps/web/tests/e2e/laura.spec.ts`
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/middleware.ts`
- Modify: any touched Laura service/controller files as needed

- [ ] **Step 1: Add negative-path tests**

Backend:
- unauthorized user cannot access Laura routes
- user cannot load another user's Laura session
- malformed provider output returns a controlled 400/422 path

Frontend:
- hidden nav item for disallowed roles
- confirmation button disabled while save is pending
- discarded blocks are excluded from persisted payload

- [ ] **Step 2: Run the targeted backend and web suites**

Run:

```bash
pnpm --filter @norgtech/api test -- laura.e2e-spec.ts
pnpm --filter @norgtech/web test:e2e -- laura.spec.ts
```

- [ ] **Step 3: Run regression suites that Laura directly touches**

Run:

```bash
pnpm --filter @norgtech/api test -- follow-up-tasks.e2e-spec.ts
pnpm --filter @norgtech/api test -- visits.e2e-spec.ts
pnpm --filter @norgtech/api test -- opportunities.e2e-spec.ts
pnpm --filter @norgtech/web test:e2e -- agenda.spec.ts
pnpm --filter @norgtech/web test:e2e -- customers.spec.ts
```

Expected:
- existing agenda and entity flows still pass

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/laura.e2e-spec.ts apps/web/tests/e2e/laura.spec.ts apps/web/src/lib/auth.ts apps/web/src/middleware.ts apps/api/src/modules/laura apps/web/src/components/laura
git commit -m "test: harden Laura permissions and regression coverage"
```

## Notes for Implementation

### Prompting and provider isolation

- Keep prompt text in `apps/api/src/modules/laura/prompts/laura-system-prompt.ts`
- Never scatter prompt strings across controller or UI files
- The LLM service must return already-validated domain data, not raw provider responses

### Why JSON proposal payload in V1

- The proposal block contract will evolve quickly while the UX is tuned
- JSON payload avoids over-normalizing before user behavior is known
- Final persisted CRM records still use existing strict tables

### Why not create a separate Laura domain for tasks/visits

- Existing visits and follow-up tasks already have validation and audit logging
- Laura should orchestrate those modules, not duplicate their responsibilities

## Spec Coverage Check

- Free-form entry with no preselected customer: covered by Tasks 1, 2, and 5
- Conversational clarification before save: covered by Tasks 2 and 5
- Editable confirmation blocks: covered by Tasks 3 and 5
- Partial save by block: covered by Tasks 3 and 5
- Session memory in one conversation: covered by Task 2
- Standalone entry point plus contextual launch: covered by Tasks 5 and 6
- Agenda query mode with prioritization only over existing records: covered by Task 4
- Warm assistant persona and non-bot UX: covered by Task 5
- Future learning from corrections excluded from V1: intentionally documented only, not planned for implementation

## Placeholder Scan

No `TODO`, `TBD`, or deferred implementation placeholders should remain in execution. The only intentional placeholder is the Prisma migration timestamp folder name, which must be replaced by the generated timestamp when implementing.

## Type Consistency Check

- `sessionId`, `proposalId`, `mode`, `blocks`, and `enabled` are used consistently across controller, backend services, and web UI
- proposal blocks are always named `interaction`, `opportunity`, `followUp`, `task`, `signals`
- agenda mode response is always separate from proposal mode response
