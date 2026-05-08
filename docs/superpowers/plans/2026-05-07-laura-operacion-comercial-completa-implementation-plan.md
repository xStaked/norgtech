# Laura Operacion Comercial Completa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Laura operate quotes, orders, follow-ups, and visits end-to-end through chat with mandatory editable confirmation, explicit ambiguity handling, adaptive read answers, and related-impact proposals for reschedule/cancel flows.

**Architecture:** Extend the existing platform-agent path instead of adding a parallel Laura flow. The agent should tighten capability and validation rules for the four priority entities, enrich planner/proposal outputs with completeness and impact metadata, and keep persistence behind the existing confirmation pipeline. The web client should keep the compact proposal pattern but make primary versus related actions easier to understand before confirmation.

**Tech Stack:** TypeScript, Vitest, LangGraph, Zod, NestJS, Next.js, React.

---

## Scope

This plan implements the approved commercial-operations phase for Laura:

- balanced intent handling across `quote`, `order`, `followUp`, and `visit`
- clarification-first behavior when entity resolution is ambiguous
- stricter quote/order completeness checks before proposal confirmation
- adaptive read responses for state queries
- related-impact proposal generation for reschedule/cancel flows
- compact but editable proposal UX for primary and related actions

This plan does not introduce:

- bulk destructive chat operations
- silent persistence
- cross-session memory
- full-module parity for every other CRM entity

## File Structure

- Modify `apps/agent-laura/src/platform/capabilities.ts`
  - Tighten capabilities for `quotes`, `orders`, `followups`, `visits`.
- Modify `apps/agent-laura/src/platform/types.ts`
  - Add completeness, ambiguity, and related-impact metadata.
- Modify `apps/agent-laura/src/platform/planner.ts`
  - Produce structured read/write/mixed plans for commercial operations.
- Modify `apps/agent-laura/src/platform/validator.ts`
  - Enforce confirmation, completeness, and ambiguity rules.
- Modify `apps/agent-laura/src/platform/proposal-builder.ts`
  - Build separate primary and related proposal actions.
- Modify `apps/agent-laura/src/platform/read-executor.ts`
  - Return adaptive summaries for quotes, orders, follow-ups, and visits.
- Modify `apps/agent-laura/src/graph/nodes/platform.ts`
  - Orchestrate clarification, adaptive reads, and proposal creation.
- Modify `apps/agent-laura/src/tools/update-followup.ts`
  - Support complete/cancel/reschedule semantics consistently.
- Modify `apps/agent-laura/src/tools/update-visit.ts`
  - Support complete/cancel/reschedule semantics consistently.
- Modify `apps/api/src/modules/laura/laura-agents.controller.ts`
  - Ensure required read/write agent endpoints match the phase behavior.
- Modify `apps/api/src/modules/laura/laura-persistence.service.ts`
  - Persist related proposal actions safely and report partial failures.
- Modify `apps/api/src/modules/laura/laura.types.ts`
  - Align payload typing for related actions and adaptive summaries.
- Modify `apps/web/src/components/laura/laura-proposal-summary.tsx`
  - Show primary actions and related impacts separately.
- Modify `apps/web/src/components/laura/laura-proposal-card.tsx`
  - Keep compact summary first, details on expansion.
- Modify `apps/web/src/components/laura/laura-data-card.tsx`
  - Render adaptive read state cards more clearly.
- Modify `apps/web/src/components/laura/laura-types.ts`
  - Mirror frontend payload metadata for related actions and adaptive reads.
- Test `apps/agent-laura/src/__tests__/platform-capabilities.test.ts`
- Test `apps/agent-laura/src/__tests__/platform-planner.test.ts`
- Test `apps/agent-laura/src/__tests__/platform-actions.test.ts`
- Test `apps/agent-laura/src/__tests__/confirm.test.ts`

### Task 1: Lock Capability And Validation Rules For The Four Priority Entities

**Files:**
- Modify: `apps/agent-laura/src/platform/types.ts`
- Modify: `apps/agent-laura/src/platform/capabilities.ts`
- Modify: `apps/agent-laura/src/platform/validator.ts`
- Test: `apps/agent-laura/src/__tests__/platform-capabilities.test.ts`

- [ ] **Step 1: Write failing capability tests**

Update `apps/agent-laura/src/__tests__/platform-capabilities.test.ts` with coverage like:

```ts
import { describe, expect, it } from "vitest";
import { getCapability } from "../platform/capabilities.js";
import { validatePlan } from "../platform/validator.js";

describe("commercial capability rules", () => {
  it("requires complete commercial detail before quote proposal can pass validation", () => {
    const quoteCreate = getCapability("quotes", "create");

    expect(quoteCreate?.requiredFields).toEqual([
      "customerId",
      "items",
      "pricing",
      "conditions",
      "status",
    ]);
  });

  it("blocks ambiguous write plans before proposal creation", () => {
    const result = validatePlan({
      intent: "write",
      actions: [{ domain: "visits", action: "update", kind: "write", confidence: 0.92, fields: {} }],
      missingFields: [],
      ambiguity: ["multiple_visits"],
      confidence: 0.92,
    });

    expect(result.ok).toBe(false);
    expect(result.clarificationQuestion).toContain("visita");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-capabilities.test.ts
```

Expected: FAIL because the current required fields and ambiguity behavior are still looser than the spec.

- [ ] **Step 3: Extend platform types**

In `apps/agent-laura/src/platform/types.ts`, add the metadata the validator needs:

```ts
export interface PlannedAction {
  domain: CapabilityDomain;
  action: CapabilityAction;
  kind: CapabilityKind;
  confidence: number;
  fields: Record<string, unknown>;
  entityRef?: string;
  humanSummary?: string;
  relatedTo?: string;
  role?: "primary" | "related";
}

export interface PlatformPlan {
  intent: "read" | "write" | "mixed" | "clarification" | "greeting" | "help" | "unsupported";
  actions: PlannedAction[];
  answer?: string;
  missingFields: string[];
  ambiguity: string[];
  clarificationQuestion?: string;
  confidence: number;
  responseStyle?: "brief" | "adaptive";
}
```

- [ ] **Step 4: Tighten capability rules**

In `apps/agent-laura/src/platform/capabilities.ts`, make the four commercial entities explicit:

```ts
{ domain: "quotes", action: "create", kind: "write", requiredFields: ["customerId", "items", "pricing", "conditions", "status"], optionalFields: ["opportunityId", "validUntil", "notes"], requiresConfirmation: true, toolName: "create_quote", summaryTemplate: "Crear cotización" },
{ domain: "orders", action: "create", kind: "write", requiredFields: ["customerId", "items", "pricing", "conditions", "status"], optionalFields: ["sourceQuoteId", "notes"], requiresConfirmation: true, toolName: "create_order", summaryTemplate: "Crear pedido" },
{ domain: "followups", action: "cancel", kind: "write", requiredFields: ["id"], optionalFields: ["notes"], requiresConfirmation: true, toolName: "update_followup", summaryTemplate: "Cancelar seguimiento" },
{ domain: "visits", action: "cancel", kind: "write", requiredFields: ["id"], optionalFields: ["reason"], requiresConfirmation: true, toolName: "update_visit", summaryTemplate: "Cancelar visita" },
```

- [ ] **Step 5: Enforce completeness and ambiguity in validation**

In `apps/agent-laura/src/platform/validator.ts`, add the core guard:

```ts
if (plan.ambiguity.length > 0) {
  return {
    ok: false,
    executableReads: [],
    proposalWrites: [],
    missingFields: [],
    errors: ["ambiguous_reference"],
    clarificationQuestion: plan.clarificationQuestion ?? "Necesito confirmar a cuál registro te referís.",
  };
}
```

Also validate quote/order completeness:

```ts
const commercialCreate = action.domain === "quotes" || action.domain === "orders";
if (commercialCreate && action.action === "create") {
  const missing = capability.requiredFields.filter((field) => action.fields[field] == null);
  if (missing.length > 0) {
    return {
      ok: false,
      executableReads: [],
      proposalWrites: [],
      missingFields: missing,
      errors: ["missing_commercial_fields"],
      clarificationQuestion: "Me faltan datos para dejarlo listo: cliente, items, precios, condiciones y estado.",
    };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-capabilities.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/agent-laura/src/platform/types.ts apps/agent-laura/src/platform/capabilities.ts apps/agent-laura/src/platform/validator.ts apps/agent-laura/src/__tests__/platform-capabilities.test.ts
git commit -m "feat(laura): lock commercial capability rules"
```

### Task 2: Teach The Planner To Build Balanced Commercial Plans

**Files:**
- Modify: `apps/agent-laura/src/platform/planner.ts`
- Modify: `apps/agent-laura/src/graph/nodes/platform.ts`
- Test: `apps/agent-laura/src/__tests__/platform-planner.test.ts`

- [ ] **Step 1: Write failing planner tests**

Update `apps/agent-laura/src/__tests__/platform-planner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPlatformPlan } from "../platform/planner.js";

describe("commercial planner", () => {
  it("builds mixed plans without biasing agenda over commerce", async () => {
    const plan = await buildPlatformPlan("Reprograma la visita del jueves y mové también el seguimiento.");

    expect(plan.intent).toBe("write");
    expect(plan.actions.map((action) => action.domain)).toEqual(["visits", "followups"]);
  });

  it("asks for clarification before planning ambiguous writes", async () => {
    const plan = await buildPlatformPlan("Cancela la visita de mañana.");

    expect(plan.ambiguity.length).toBeGreaterThan(0);
    expect(plan.clarificationQuestion).toContain("visita");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-planner.test.ts
```

Expected: FAIL because the current planner does not yet enforce the new balance and ambiguity requirements.

- [ ] **Step 3: Update planner output contract**

In `apps/agent-laura/src/platform/planner.ts`, extend the structured prompt and parser:

```ts
const PlatformPlanSchema = z.object({
  intent: z.enum(["read", "write", "mixed", "clarification", "greeting", "help", "unsupported"]),
  actions: z.array(z.object({
    domain: z.enum(["quotes", "orders", "followups", "visits", "customers", "contacts", "opportunities", "products", "segments", "reports", "dashboard"]),
    action: z.string(),
    kind: z.enum(["read", "write"]),
    confidence: z.number(),
    fields: z.record(z.unknown()),
    relatedTo: z.string().optional(),
    role: z.enum(["primary", "related"]).optional(),
  })),
  missingFields: z.array(z.string()),
  ambiguity: z.array(z.string()),
  clarificationQuestion: z.string().optional(),
  confidence: z.number(),
  responseStyle: z.enum(["brief", "adaptive"]).optional(),
});
```

- [ ] **Step 4: Update platform orchestration**

In `apps/agent-laura/src/graph/nodes/platform.ts`, make ambiguity a hard stop before proposal creation:

```ts
if (plan.ambiguity.length > 0 || plan.missingFields.length > 0) {
  return {
    ...state,
    route: "clarify",
    assistantMessage: plan.clarificationQuestion ?? "Necesito un dato más para seguir.",
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-planner.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-laura/src/platform/planner.ts apps/agent-laura/src/graph/nodes/platform.ts apps/agent-laura/src/__tests__/platform-planner.test.ts
git commit -m "feat(laura): plan balanced commercial intents"
```

### Task 3: Generate Related-Impact Actions For Reschedule And Cancel Flows

**Files:**
- Modify: `apps/agent-laura/src/platform/proposal-builder.ts`
- Modify: `apps/agent-laura/src/platform/context.ts`
- Test: `apps/agent-laura/src/__tests__/platform-actions.test.ts`

- [ ] **Step 1: Write failing action tests**

Update `apps/agent-laura/src/__tests__/platform-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildProposalFromActions } from "../platform/proposal-builder.js";

describe("related commercial impacts", () => {
  it("adds a related follow-up proposal when rescheduling a visit affects a pending commitment", () => {
    const proposal = buildProposalFromActions([
      { domain: "visits", action: "update", kind: "write", confidence: 0.95, role: "primary", fields: { id: "visit-1", scheduledAt: "2026-05-09T10:00:00.000Z" } },
      { domain: "followups", action: "update", kind: "write", confidence: 0.95, role: "related", relatedTo: "visit-1", fields: { id: "fu-1", dueAt: "2026-05-09T16:00:00.000Z" } },
    ]);

    expect(proposal.summary.primaryCount).toBe(1);
    expect(proposal.summary.relatedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-actions.test.ts
```

Expected: FAIL because the proposal summary does not yet distinguish primary and related actions.

- [ ] **Step 3: Extend proposal summary metadata**

In `apps/agent-laura/src/platform/proposal-builder.ts`, enrich the summary:

```ts
const summary = {
  primaryCount: actions.filter((action) => action.role !== "related").length,
  relatedCount: actions.filter((action) => action.role === "related").length,
  labels: actions.map((action) => action.humanSummary ?? `${action.action}:${action.domain}`),
};
```

- [ ] **Step 4: Use current context to detect nearby impacts**

In `apps/agent-laura/src/platform/context.ts`, keep enough linked-entity context to propose related actions safely:

```ts
relatedEntities: {
  openFollowUpIds: string[];
  openQuoteIds: string[];
  openOrderIds: string[];
  upcomingVisitIds: string[];
},
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-actions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-laura/src/platform/proposal-builder.ts apps/agent-laura/src/platform/context.ts apps/agent-laura/src/__tests__/platform-actions.test.ts
git commit -m "feat(laura): propose related commercial impacts"
```

### Task 4: Complete Confirm/Persistence Support For Multi-Action Commercial Operations

**Files:**
- Modify: `apps/agent-laura/src/confirm.ts`
- Modify: `apps/api/src/modules/laura/laura-persistence.service.ts`
- Modify: `apps/api/src/modules/laura/laura.types.ts`
- Test: `apps/agent-laura/src/__tests__/confirm.test.ts`

- [ ] **Step 1: Write failing confirm tests**

Update `apps/agent-laura/src/__tests__/confirm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { confirmProposal } from "../confirm.js";

describe("commercial proposal confirmation", () => {
  it("reports partial success when a related action fails after the primary action succeeds", async () => {
    const result = await confirmProposal({
      blocks: {
        visit: { enabled: true, action: "update", id: "visit-1", scheduledAt: "2026-05-09T10:00:00.000Z" },
        followUp: { enabled: true, action: "update", id: "fu-1", dueAt: "2026-05-09T16:00:00.000Z", relatedTo: "visit-1" },
      },
    });

    expect(result.saved).toBeDefined();
    expect(result.discarded).toBeDefined();
    expect(result.errors).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/confirm.test.ts
```

Expected: FAIL because related-action metadata and partial-failure reporting are incomplete.

- [ ] **Step 3: Update persistence result typing**

In `apps/api/src/modules/laura/laura.types.ts`, align the result:

```ts
export interface LauraProposalExecutionResult {
  saved: string[];
  discarded: string[];
  errors: Array<{ block: string; message: string }>;
}
```

- [ ] **Step 4: Preserve safe partial success**

In `apps/api/src/modules/laura/laura-persistence.service.ts`, handle related failures without hiding the primary success:

```ts
try {
  await this.persistPrimaryBlock(block);
  saved.push(blockKey);
} catch (error) {
  errors.push({ block: blockKey, message: toErrorMessage(error) });
}
```

And for related blocks:

```ts
if (block.relatedTo && !saved.includes(block.relatedTo)) {
  discarded.push(blockKey);
  continue;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/confirm.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-laura/src/confirm.ts apps/api/src/modules/laura/laura-persistence.service.ts apps/api/src/modules/laura/laura.types.ts apps/agent-laura/src/__tests__/confirm.test.ts
git commit -m "feat(laura): confirm multi-action commercial proposals"
```

### Task 5: Render Adaptive Read Answers And Clearer Proposal Summaries In The Web Client

**Files:**
- Modify: `apps/web/src/components/laura/laura-data-card.tsx`
- Modify: `apps/web/src/components/laura/laura-proposal-summary.tsx`
- Modify: `apps/web/src/components/laura/laura-proposal-card.tsx`
- Modify: `apps/web/src/components/laura/laura-types.ts`

- [ ] **Step 1: Add read/proposal payload types**

In `apps/web/src/components/laura/laura-types.ts`, add:

```ts
export interface LauraProposalSummaryMeta {
  primaryCount: number;
  relatedCount: number;
  labels: string[];
}

export interface LauraAdaptiveReadMeta {
  responseStyle: "brief" | "adaptive";
  riskLabel?: string;
  relatedEntities?: string[];
}
```

- [ ] **Step 2: Update proposal summary layout**

In `apps/web/src/components/laura/laura-proposal-summary.tsx`, render separate sections:

```tsx
{summary.relatedCount > 0 ? (
  <div>
    <p>Acción principal y {summary.relatedCount} impacto relacionado para revisar.</p>
  </div>
) : (
  <p>Laura preparó {summary.primaryCount} acción para confirmar.</p>
)}
```

- [ ] **Step 3: Update adaptive read card rendering**

In `apps/web/src/components/laura/laura-data-card.tsx`, add concise-first rendering:

```tsx
{meta?.responseStyle === "adaptive" && meta.relatedEntities?.length ? (
  <p style={{ margin: "8px 0 0", fontSize: 12 }}>
    Relacionado con: {meta.relatedEntities.join(", ")}
  </p>
) : null}
```

- [ ] **Step 4: Keep detail editing behind expansion**

In `apps/web/src/components/laura/laura-proposal-card.tsx`, keep the current expanded editor pattern, but make summary first:

```tsx
<LauraProposalSummary
  proposal={proposal}
  summary={proposal.summary}
  expandedKey={expandedKey}
  onToggleExpanded={setExpandedKey}
/>
```

- [ ] **Step 5: Build the web app**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/laura/laura-data-card.tsx apps/web/src/components/laura/laura-proposal-summary.tsx apps/web/src/components/laura/laura-proposal-card.tsx apps/web/src/components/laura/laura-types.ts
git commit -m "feat(web): clarify laura commercial summaries"
```

### Task 6: Run End-To-End Agent Verification For Commercial Scenarios

**Files:**
- Test: `apps/agent-laura/src/__tests__/agent-nodes.test.ts`
- Test: `apps/agent-laura/src/__tests__/server-session.test.ts`

- [ ] **Step 1: Add scenario coverage**

Extend `apps/agent-laura/src/__tests__/agent-nodes.test.ts` with cases like:

```ts
it("asks for clarification before modifying an ambiguous visit", async () => {
  const result = await runAgentTurn("Cancela la visita de mañana");
  expect(result.assistantMessage).toContain("cuál");
});

it("answers quote status in adaptive mode when a risk exists", async () => {
  const result = await runAgentTurn("Cómo va la cotización de Acme?");
  expect(result.mode).toBe("data");
  expect(result.meta?.responseStyle).toBe("adaptive");
});
```

- [ ] **Step 2: Run focused agent test suite**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/agent-nodes.test.ts src/__tests__/server-session.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run broader Laura tests**

Run:

```bash
pnpm --filter @norgtech/agent-laura test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/agent-laura/src/__tests__/agent-nodes.test.ts apps/agent-laura/src/__tests__/server-session.test.ts
git commit -m "test(laura): verify commercial operations flow"
```

## Spec Coverage Check

- Balanced intent handling: covered by Task 2.
- Clarification-first ambiguity policy: covered by Tasks 1, 2, and 6.
- Quote/order completeness rules: covered by Task 1.
- Adaptive read behavior: covered by Tasks 2 and 5.
- Related-impact proposals: covered by Tasks 3, 4, and 5.
- Mandatory editable confirmation: preserved and hardened by Tasks 4 and 5.

## Placeholder Scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Every task points to exact files and commands.
- Validation and test expectations are explicit.

## Type Consistency Check

- `role`, `relatedTo`, and `responseStyle` are introduced first in platform types, then reused in planner, validator, proposal builder, API typing, and frontend components.
- Quote/order completeness uses the same required-field concept across capability registry and validator.

Plan complete and saved to `docs/superpowers/plans/2026-05-07-laura-operacion-comercial-completa-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
