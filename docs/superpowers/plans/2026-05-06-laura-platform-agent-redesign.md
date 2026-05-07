# Laura Platform Agent Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Laura's keyword-heavy routing with a capability-driven platform agent and render write confirmations as compact, progressive proposals.

**Architecture:** Keep the existing LangGraph service and CRM tools, but add a new platform path: `router -> platform`. The router only handles active proposal lifecycle commands and obvious greetings; all CRM operation requests go through a structured planner, capability validator, read executor, clarification builder, and proposal builder. The frontend keeps the existing proposal payload shape but replaces the large default proposal card with a compact summary that expands details on demand.

**Tech Stack:** TypeScript, LangGraph, LangChain tools, Zod, Vitest, Next.js React components, lucide-react.

---

## Scope

This plan implements phase 1 of the approved design:

- capability registry for existing CRM domains
- structured planner output
- validator for unsupported actions, missing fields, permissions, and confirmation rules
- single platform node for read, write, mixed, clarification, help, and greeting outcomes
- compact proposal rendering in the frontend
- conversation-level tests around planner behavior and UI summary behavior

This plan does not add backend transaction endpoints. Confirmed writes continue through the existing confirmation flow.

## File Structure

- Create `apps/agent-laura/src/platform/capabilities.ts`
  - Defines supported domains/actions and required fields.
- Create `apps/agent-laura/src/platform/types.ts`
  - Defines planner, validation, proposal action, and context types.
- Create `apps/agent-laura/src/platform/context.ts`
  - Converts `LauraState` into compact context for the planner.
- Create `apps/agent-laura/src/platform/planner.ts`
  - Calls the LLM and parses strict JSON output with Zod.
- Create `apps/agent-laura/src/platform/validator.ts`
  - Validates planned actions against capabilities.
- Create `apps/agent-laura/src/platform/proposal-builder.ts`
  - Converts validated write actions into existing `ProposalPayload` blocks.
- Create `apps/agent-laura/src/platform/read-executor.ts`
  - Executes selected read actions with existing tools/API helpers.
- Create `apps/agent-laura/src/graph/nodes/platform.ts`
  - Orchestrates context, planning, validation, reading, clarifying, and proposing.
- Modify `apps/agent-laura/src/types.ts`
  - Add internal `platform` mode and optional proposal metadata if needed.
- Modify `apps/agent-laura/src/graph/graph.ts`
  - Add `platform` node and route.
- Modify `apps/agent-laura/src/graph/edges.ts`
  - Add `platform` edge.
- Modify `apps/agent-laura/src/graph/nodes/router.ts`
  - Reduce router to lifecycle/greeting/agenda shortcut/help shortcut, defaulting to `platform`.
- Modify `apps/agent-laura/src/__tests__/agent-nodes.test.ts`
  - Replace brittle keyword expectations with platform planner tests.
- Create `apps/web/src/components/laura/laura-proposal-summary.tsx`
  - Compact proposal summary with expandable details.
- Modify `apps/web/src/components/laura/laura-proposal-card.tsx`
  - Use compact summary as default view.
- Modify `apps/web/src/components/laura/laura-types.ts`
  - Add lightweight summary/action helper types if useful.

---

### Task 1: Add Platform Capability Types And Registry

**Files:**
- Create: `apps/agent-laura/src/platform/types.ts`
- Create: `apps/agent-laura/src/platform/capabilities.ts`
- Test: `apps/agent-laura/src/__tests__/platform-capabilities.test.ts`

- [ ] **Step 1: Write failing capability tests**

Create `apps/agent-laura/src/__tests__/platform-capabilities.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getCapability, listCapabilities } from "../platform/capabilities.js";

describe("platform capabilities", () => {
  it("lists read and write capabilities for core CRM modules", () => {
    const capabilities = listCapabilities();

    expect(capabilities.some((cap) => cap.domain === "customers" && cap.action === "search" && cap.kind === "read")).toBe(true);
    expect(capabilities.some((cap) => cap.domain === "quotes" && cap.action === "create" && cap.kind === "write")).toBe(true);
    expect(capabilities.some((cap) => cap.domain === "followups" && cap.action === "create" && cap.requiresConfirmation)).toBe(true);
  });

  it("returns required fields for quote creation", () => {
    const capability = getCapability("quotes", "create");

    expect(capability?.requiredFields).toEqual(["customerId"]);
    expect(capability?.requiresConfirmation).toBe(true);
    expect(capability?.toolName).toBe("create_quote");
  });

  it("returns undefined for unsupported actions", () => {
    expect(getCapability("orders", "bulk_delete")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-capabilities.test.ts
```

Expected: FAIL because `../platform/capabilities.js` does not exist.

- [ ] **Step 3: Add platform shared types**

Create `apps/agent-laura/src/platform/types.ts`:

```ts
import type { ProposalPayload } from "../types.js";

export type CapabilityDomain =
  | "customers"
  | "contacts"
  | "opportunities"
  | "visits"
  | "followups"
  | "quotes"
  | "orders"
  | "products"
  | "segments"
  | "reports"
  | "dashboard";

export type CapabilityAction =
  | "search"
  | "detail"
  | "create"
  | "update"
  | "cancel"
  | "complete"
  | "change_status"
  | "add_item"
  | "bulk_delete";

export type CapabilityKind = "read" | "write";

export interface PlatformCapability {
  domain: CapabilityDomain;
  action: CapabilityAction;
  kind: CapabilityKind;
  requiredFields: string[];
  optionalFields: string[];
  requiresConfirmation: boolean;
  toolName: string;
  summaryTemplate: string;
  allowedRoles?: string[];
}

export interface PlatformContext {
  userId: string;
  sessionId: string;
  currentMessage: string;
  recentMessages: string[];
  customerContext: { id: string; label: string } | null;
  opportunityContext: { id: string; label: string } | null;
  mentionedEntities: Record<string, string | undefined>;
  agendaSummary: string;
  activeProposal: ProposalPayload | null;
}

export interface PlannedAction {
  domain: CapabilityDomain;
  action: CapabilityAction;
  kind: CapabilityKind;
  confidence: number;
  fields: Record<string, unknown>;
  entityRef?: string;
  humanSummary?: string;
}

export interface PlatformPlan {
  intent: "read" | "write" | "mixed" | "clarification" | "greeting" | "help" | "unsupported";
  actions: PlannedAction[];
  answer?: string;
  missingFields: string[];
  ambiguity: string[];
  clarificationQuestion?: string;
  confidence: number;
}

export interface ValidationResult {
  ok: boolean;
  executableReads: PlannedAction[];
  proposalWrites: PlannedAction[];
  missingFields: string[];
  errors: string[];
  clarificationQuestion?: string;
}
```

- [ ] **Step 4: Add capability registry**

Create `apps/agent-laura/src/platform/capabilities.ts`:

```ts
import type { CapabilityAction, CapabilityDomain, PlatformCapability } from "./types.js";

const capabilities: PlatformCapability[] = [
  { domain: "customers", action: "search", kind: "read", requiredFields: [], optionalFields: ["search"], requiresConfirmation: false, toolName: "search_customers", summaryTemplate: "Buscar clientes" },
  { domain: "customers", action: "detail", kind: "read", requiredFields: ["customerId"], optionalFields: [], requiresConfirmation: false, toolName: "get_customer_details", summaryTemplate: "Ver cliente" },
  { domain: "customers", action: "create", kind: "write", requiredFields: ["legalName"], optionalFields: ["displayName", "phone", "email", "address", "notes"], requiresConfirmation: true, toolName: "create_customer", summaryTemplate: "Crear cliente" },
  { domain: "customers", action: "update", kind: "write", requiredFields: ["id"], optionalFields: ["legalName", "displayName", "phone", "email", "address", "notes"], requiresConfirmation: true, toolName: "update_customer", summaryTemplate: "Actualizar cliente" },

  { domain: "contacts", action: "search", kind: "read", requiredFields: [], optionalFields: ["search", "customerId"], requiresConfirmation: false, toolName: "search_contacts", summaryTemplate: "Buscar contactos" },
  { domain: "contacts", action: "create", kind: "write", requiredFields: ["customerId", "fullName"], optionalFields: ["roleTitle", "phone", "email", "notes"], requiresConfirmation: true, toolName: "create_contact", summaryTemplate: "Crear contacto" },
  { domain: "contacts", action: "update", kind: "write", requiredFields: ["id"], optionalFields: ["fullName", "roleTitle", "phone", "email", "notes"], requiresConfirmation: true, toolName: "update_contact", summaryTemplate: "Actualizar contacto" },

  { domain: "opportunities", action: "search", kind: "read", requiredFields: [], optionalFields: ["search", "customerId"], requiresConfirmation: false, toolName: "search_opportunities", summaryTemplate: "Buscar oportunidades" },
  { domain: "opportunities", action: "detail", kind: "read", requiredFields: ["opportunityId"], optionalFields: [], requiresConfirmation: false, toolName: "get_opportunity_details", summaryTemplate: "Ver oportunidad" },
  { domain: "opportunities", action: "create", kind: "write", requiredFields: ["customerId", "title"], optionalFields: ["stage", "estimatedValue"], requiresConfirmation: true, toolName: "upsert_opportunity", summaryTemplate: "Crear oportunidad" },
  { domain: "opportunities", action: "update", kind: "write", requiredFields: ["id"], optionalFields: ["title", "stage", "estimatedValue"], requiresConfirmation: true, toolName: "update_opportunity", summaryTemplate: "Actualizar oportunidad" },

  { domain: "visits", action: "search", kind: "read", requiredFields: [], optionalFields: ["customerId", "status", "dateFrom", "dateTo"], requiresConfirmation: false, toolName: "search_visits", summaryTemplate: "Buscar visitas" },
  { domain: "visits", action: "update", kind: "write", requiredFields: ["id"], optionalFields: ["scheduledAt", "summary", "notes"], requiresConfirmation: true, toolName: "update_visit", summaryTemplate: "Actualizar visita" },

  { domain: "followups", action: "search", kind: "read", requiredFields: [], optionalFields: ["customerId", "status"], requiresConfirmation: false, toolName: "search_followups", summaryTemplate: "Buscar seguimientos" },
  { domain: "followups", action: "create", kind: "write", requiredFields: ["customerId", "title", "dueAt", "type"], optionalFields: ["opportunityId", "notes"], requiresConfirmation: true, toolName: "create_followup", summaryTemplate: "Crear seguimiento" },
  { domain: "followups", action: "update", kind: "write", requiredFields: ["id"], optionalFields: ["title", "dueAt", "notes"], requiresConfirmation: true, toolName: "update_followup", summaryTemplate: "Actualizar seguimiento" },
  { domain: "followups", action: "complete", kind: "write", requiredFields: ["id"], optionalFields: ["notes"], requiresConfirmation: true, toolName: "update_followup", summaryTemplate: "Completar seguimiento" },

  { domain: "quotes", action: "search", kind: "read", requiredFields: [], optionalFields: ["customerId", "status", "search"], requiresConfirmation: false, toolName: "search_quotes", summaryTemplate: "Buscar cotizaciones" },
  { domain: "quotes", action: "detail", kind: "read", requiredFields: ["quoteId"], optionalFields: [], requiresConfirmation: false, toolName: "get_quote_details", summaryTemplate: "Ver cotización" },
  { domain: "quotes", action: "create", kind: "write", requiredFields: ["customerId"], optionalFields: ["opportunityId", "validUntil", "notes", "items"], requiresConfirmation: true, toolName: "create_quote", summaryTemplate: "Crear cotización" },
  { domain: "quotes", action: "update", kind: "write", requiredFields: ["id"], optionalFields: ["status", "notes"], requiresConfirmation: true, toolName: "update_quote", summaryTemplate: "Actualizar cotización" },

  { domain: "orders", action: "search", kind: "read", requiredFields: [], optionalFields: ["customerId", "status", "search"], requiresConfirmation: false, toolName: "search_orders", summaryTemplate: "Buscar pedidos" },
  { domain: "orders", action: "detail", kind: "read", requiredFields: ["orderId"], optionalFields: [], requiresConfirmation: false, toolName: "get_order_details", summaryTemplate: "Ver pedido" },
  { domain: "orders", action: "create", kind: "write", requiredFields: ["customerId"], optionalFields: ["opportunityId", "sourceQuoteId", "notes", "items"], requiresConfirmation: true, toolName: "create_order", summaryTemplate: "Crear pedido" },
  { domain: "orders", action: "update", kind: "write", requiredFields: ["id"], optionalFields: ["status", "notes"], requiresConfirmation: true, toolName: "update_order", summaryTemplate: "Actualizar pedido" },

  { domain: "products", action: "search", kind: "read", requiredFields: [], optionalFields: ["search", "active"], requiresConfirmation: false, toolName: "search_products", summaryTemplate: "Buscar productos" },
  { domain: "products", action: "detail", kind: "read", requiredFields: ["productId"], optionalFields: [], requiresConfirmation: false, toolName: "get_product_details", summaryTemplate: "Ver producto" },
  { domain: "products", action: "create", kind: "write", requiredFields: ["sku", "name"], optionalFields: ["description", "unit", "presentation", "basePrice"], requiresConfirmation: true, toolName: "create_product", summaryTemplate: "Crear producto" },
  { domain: "products", action: "update", kind: "write", requiredFields: ["id"], optionalFields: ["sku", "name", "description", "basePrice"], requiresConfirmation: true, toolName: "update_product", summaryTemplate: "Actualizar producto" },

  { domain: "segments", action: "search", kind: "read", requiredFields: [], optionalFields: [], requiresConfirmation: false, toolName: "search_segments", summaryTemplate: "Listar segmentos" },
  { domain: "segments", action: "create", kind: "write", requiredFields: ["name"], optionalFields: ["description"], requiresConfirmation: true, toolName: "create_segment", summaryTemplate: "Crear segmento" },
  { domain: "segments", action: "update", kind: "write", requiredFields: ["id"], optionalFields: ["name", "description"], requiresConfirmation: true, toolName: "update_segment", summaryTemplate: "Actualizar segmento" },

  { domain: "dashboard", action: "detail", kind: "read", requiredFields: [], optionalFields: ["userId"], requiresConfirmation: false, toolName: "get_dashboard_summary", summaryTemplate: "Ver dashboard" },
];

export function listCapabilities(): PlatformCapability[] {
  return capabilities;
}

export function getCapability(domain: CapabilityDomain, action: CapabilityAction): PlatformCapability | undefined {
  return capabilities.find((capability) => capability.domain === domain && capability.action === action);
}

export function capabilitiesForPrompt(): string {
  return capabilities
    .map((capability) => {
      const required = capability.requiredFields.length > 0 ? capability.requiredFields.join(", ") : "ninguno";
      const confirmation = capability.requiresConfirmation ? "requiere_confirmacion" : "lectura_directa";
      return `- ${capability.domain}.${capability.action} (${capability.kind}, ${confirmation}) required: ${required}`;
    })
    .join("\n");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-capabilities.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/agent-laura/src/platform/types.ts apps/agent-laura/src/platform/capabilities.ts apps/agent-laura/src/__tests__/platform-capabilities.test.ts
git commit -m "feat(laura): add platform capability registry"
```

---

### Task 2: Add Context Builder, Planner, And Validator

**Files:**
- Create: `apps/agent-laura/src/platform/context.ts`
- Create: `apps/agent-laura/src/platform/planner.ts`
- Create: `apps/agent-laura/src/platform/validator.ts`
- Test: `apps/agent-laura/src/__tests__/platform-planner.test.ts`

- [ ] **Step 1: Write planner and validator tests**

Create `apps/agent-laura/src/__tests__/platform-planner.test.ts`:

```ts
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LauraState } from "../graph/state.js";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("../config/providers.js", () => ({
  createLlm: () => ({ invoke: mockInvoke }),
}));

import { buildPlatformContext } from "../platform/context.js";
import { planPlatformIntent } from "../platform/planner.js";
import { validatePlatformPlan } from "../platform/validator.js";

function makeState(overrides: Partial<LauraState> = {}): LauraState {
  return {
    sessionId: "session-1",
    userId: "user-1",
    messages: [new HumanMessage("Qué cotizaciones abiertas tiene Acme?")],
    mode: "greeting",
    customerContext: { id: "customer-1", label: "Acme" },
    opportunityContext: null,
    clarificationOptions: null,
    proposal: null,
    proposalId: null,
    proposalStatus: "draft",
    agendaItems: null,
    lastError: null,
    _extractionResult: null,
    mentionedEntities: {},
    data: null,
    ...overrides,
  };
}

describe("platform planner", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("builds compact context from Laura state", () => {
    const context = buildPlatformContext(makeState());

    expect(context.userId).toBe("user-1");
    expect(context.customerContext?.id).toBe("customer-1");
    expect(context.currentMessage).toBe("Qué cotizaciones abiertas tiene Acme?");
  });

  it("parses strict read plans from the LLM", async () => {
    mockInvoke.mockResolvedValueOnce(new AIMessage(JSON.stringify({
      intent: "read",
      actions: [
        {
          domain: "quotes",
          action: "search",
          kind: "read",
          confidence: 0.92,
          fields: { customerId: "customer-1", status: "abierta" },
          humanSummary: "Buscar cotizaciones abiertas de Acme"
        }
      ],
      missingFields: [],
      ambiguity: [],
      confidence: 0.92
    })));

    const plan = await planPlatformIntent(buildPlatformContext(makeState()));

    expect(plan.intent).toBe("read");
    expect(plan.actions[0]?.domain).toBe("quotes");
    expect(plan.actions[0]?.fields.customerId).toBe("customer-1");
  });

  it("falls back to clarification on invalid LLM JSON", async () => {
    mockInvoke.mockResolvedValueOnce(new AIMessage("no json"));

    const plan = await planPlatformIntent(buildPlatformContext(makeState()));

    expect(plan.intent).toBe("clarification");
    expect(plan.clarificationQuestion).toContain("repetir");
  });
});

describe("platform validator", () => {
  it("accepts read plans without confirmation", () => {
    const result = validatePlatformPlan({
      intent: "read",
      actions: [{ domain: "quotes", action: "search", kind: "read", confidence: 0.9, fields: { customerId: "customer-1" } }],
      missingFields: [],
      ambiguity: [],
      confidence: 0.9,
    });

    expect(result.ok).toBe(true);
    expect(result.executableReads).toHaveLength(1);
    expect(result.proposalWrites).toHaveLength(0);
  });

  it("routes write plans to proposal writes", () => {
    const result = validatePlatformPlan({
      intent: "write",
      actions: [{ domain: "quotes", action: "create", kind: "write", confidence: 0.9, fields: { customerId: "customer-1", notes: "Enviar hoy" } }],
      missingFields: [],
      ambiguity: [],
      confidence: 0.9,
    });

    expect(result.ok).toBe(true);
    expect(result.executableReads).toHaveLength(0);
    expect(result.proposalWrites).toHaveLength(1);
  });

  it("rejects unsupported actions", () => {
    const result = validatePlatformPlan({
      intent: "write",
      actions: [{ domain: "orders", action: "bulk_delete", kind: "write", confidence: 0.9, fields: {} }],
      missingFields: [],
      ambiguity: [],
      confidence: 0.9,
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("no está disponible");
  });

  it("asks clarification when required fields are missing", () => {
    const result = validatePlatformPlan({
      intent: "write",
      actions: [{ domain: "followups", action: "create", kind: "write", confidence: 0.9, fields: { title: "Llamar" } }],
      missingFields: [],
      ambiguity: [],
      confidence: 0.9,
    });

    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual(["customerId", "dueAt", "type"]);
    expect(result.clarificationQuestion).toContain("faltan");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-planner.test.ts
```

Expected: FAIL because platform modules do not exist.

- [ ] **Step 3: Add context builder**

Create `apps/agent-laura/src/platform/context.ts`:

```ts
import type { BaseMessage } from "@langchain/core/messages";
import type { LauraState } from "../graph/state.js";
import type { PlatformContext } from "./types.js";

function messageToText(message: BaseMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null && "text" in part) return String((part as { text: unknown }).text);
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return String(message.content ?? "");
}

export function buildPlatformContext(state: LauraState): PlatformContext {
  const currentMessage = messageToText(state.messages[state.messages.length - 1]);
  const recentMessages = state.messages.slice(-8).map(messageToText).filter(Boolean);
  const agendaSummary = state.agendaItems?.length
    ? state.agendaItems.map((item) => `${item.type}: ${item.label}${item.scheduledAt ? ` (${item.scheduledAt})` : ""}`).join("\n")
    : "";

  return {
    userId: state.userId,
    sessionId: state.sessionId,
    currentMessage,
    recentMessages,
    customerContext: state.customerContext,
    opportunityContext: state.opportunityContext,
    mentionedEntities: state.mentionedEntities ?? {},
    agendaSummary,
    activeProposal: state.proposalStatus === "draft" ? state.proposal : null,
  };
}
```

- [ ] **Step 4: Add planner**

Create `apps/agent-laura/src/platform/planner.ts`:

```ts
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createLlm } from "../config/providers.js";
import { LAURA_SYSTEM_PROMPT } from "../prompts/system-prompt.js";
import { capabilitiesForPrompt } from "./capabilities.js";
import type { PlatformContext, PlatformPlan } from "./types.js";

const plannedActionSchema = z.object({
  domain: z.enum(["customers", "contacts", "opportunities", "visits", "followups", "quotes", "orders", "products", "segments", "reports", "dashboard"]),
  action: z.enum(["search", "detail", "create", "update", "cancel", "complete", "change_status", "add_item", "bulk_delete"]),
  kind: z.enum(["read", "write"]),
  confidence: z.number().min(0).max(1),
  fields: z.record(z.unknown()).default({}),
  entityRef: z.string().optional(),
  humanSummary: z.string().optional(),
});

const platformPlanSchema = z.object({
  intent: z.enum(["read", "write", "mixed", "clarification", "greeting", "help", "unsupported"]),
  actions: z.array(plannedActionSchema).default([]),
  answer: z.string().optional(),
  missingFields: z.array(z.string()).default([]),
  ambiguity: z.array(z.string()).default([]),
  clarificationQuestion: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
});

function cleanJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```$/, "").trim();
}

function buildPlannerPrompt(context: PlatformContext): string {
  return `${LAURA_SYSTEM_PROMPT}

Sos el planner interno de Laura. No ejecutes herramientas. Convertí el mensaje del usuario en un plan JSON estricto.

Capacidades disponibles:
${capabilitiesForPrompt()}

Reglas:
- Si el usuario pide consultar o listar datos, usá intent "read".
- Si pide crear, actualizar, completar, cancelar o cambiar estado, usá intent "write".
- Si pide consultar y escribir en el mismo mensaje, usá intent "mixed".
- Todas las acciones kind "write" requieren confirmación; no digas que ya fueron guardadas.
- Si falta un dato crítico, usá intent "clarification" o agregá missingFields y clarificationQuestion.
- Si la acción no existe en capacidades, usá intent "unsupported".
- Respondé solo JSON válido.

Contexto compacto:
${JSON.stringify(context, null, 2)}

Schema esperado:
{
  "intent": "read | write | mixed | clarification | greeting | help | unsupported",
  "actions": [
    {
      "domain": "customers | contacts | opportunities | visits | followups | quotes | orders | products | segments | reports | dashboard",
      "action": "search | detail | create | update | cancel | complete | change_status | add_item | bulk_delete",
      "kind": "read | write",
      "confidence": 0.0,
      "fields": {},
      "entityRef": "string opcional",
      "humanSummary": "string opcional"
    }
  ],
  "answer": "string opcional",
  "missingFields": [],
  "ambiguity": [],
  "clarificationQuestion": "string opcional",
  "confidence": 0.0
}`;
}

export async function planPlatformIntent(context: PlatformContext): Promise<PlatformPlan> {
  const llm = createLlm();
  const response = await llm.invoke([
    new SystemMessage(buildPlannerPrompt(context)),
    new HumanMessage(context.currentMessage),
  ]);

  try {
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    return platformPlanSchema.parse(JSON.parse(cleanJson(content)));
  } catch {
    return {
      intent: "clarification",
      actions: [],
      missingFields: [],
      ambiguity: ["invalid_planner_response"],
      clarificationQuestion: "¿Me lo podés repetir con un poco más de detalle?",
      confidence: 0,
    };
  }
}
```

- [ ] **Step 5: Add validator**

Create `apps/agent-laura/src/platform/validator.ts`:

```ts
import { getCapability } from "./capabilities.js";
import type { PlatformPlan, PlannedAction, ValidationResult } from "./types.js";

function hasField(fields: Record<string, unknown>, field: string): boolean {
  const value = fields[field];
  return value !== undefined && value !== null && value !== "";
}

function missingRequiredFields(action: PlannedAction): string[] {
  const capability = getCapability(action.domain, action.action);
  if (!capability) return [];
  return capability.requiredFields.filter((field) => !hasField(action.fields, field));
}

export function validatePlatformPlan(plan: PlatformPlan): ValidationResult {
  const executableReads: PlannedAction[] = [];
  const proposalWrites: PlannedAction[] = [];
  const errors: string[] = [];
  const missingFields = new Set<string>(plan.missingFields);

  if (plan.confidence < 0.45) {
    return {
      ok: false,
      executableReads,
      proposalWrites,
      missingFields: Array.from(missingFields),
      errors: ["La intención tiene baja confianza."],
      clarificationQuestion: plan.clarificationQuestion ?? "¿Podés aclararme qué querés hacer?",
    };
  }

  for (const action of plan.actions) {
    const capability = getCapability(action.domain, action.action);

    if (!capability) {
      errors.push(`La acción ${action.domain}.${action.action} no está disponible desde Laura.`);
      continue;
    }

    const missing = missingRequiredFields(action);
    for (const field of missing) missingFields.add(field);

    if (missing.length > 0) continue;

    if (capability.kind === "read") {
      executableReads.push(action);
    } else {
      proposalWrites.push(action);
    }
  }

  if (missingFields.size > 0) {
    return {
      ok: false,
      executableReads,
      proposalWrites,
      missingFields: Array.from(missingFields),
      errors,
      clarificationQuestion: plan.clarificationQuestion ?? `Para avanzar faltan estos datos: ${Array.from(missingFields).join(", ")}.`,
    };
  }

  if (errors.length > 0) {
    return {
      ok: false,
      executableReads,
      proposalWrites,
      missingFields: [],
      errors,
      clarificationQuestion: plan.clarificationQuestion,
    };
  }

  return {
    ok: true,
    executableReads,
    proposalWrites,
    missingFields: [],
    errors: [],
    clarificationQuestion: plan.clarificationQuestion,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-planner.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/agent-laura/src/platform/context.ts apps/agent-laura/src/platform/planner.ts apps/agent-laura/src/platform/validator.ts apps/agent-laura/src/__tests__/platform-planner.test.ts
git commit -m "feat(laura): add structured platform planner"
```

---

### Task 3: Add Proposal Builder And Read Executor

**Files:**
- Create: `apps/agent-laura/src/platform/proposal-builder.ts`
- Create: `apps/agent-laura/src/platform/read-executor.ts`
- Test: `apps/agent-laura/src/__tests__/platform-actions.test.ts`

- [ ] **Step 1: Write proposal/read tests**

Create `apps/agent-laura/src/__tests__/platform-actions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildProposalFromActions } from "../platform/proposal-builder.js";

const { mockSearchQuotes } = vi.hoisted(() => ({
  mockSearchQuotes: vi.fn().mockResolvedValue([{ id: "quote-1", status: "abierta", total: 1000 }]),
}));

vi.mock("../tools/nestjs-client.js", () => ({
  searchQuotes: mockSearchQuotes,
  searchCustomers: vi.fn(),
  searchOpportunities: vi.fn(),
  searchProducts: vi.fn(),
  searchOrders: vi.fn(),
  searchSegments: vi.fn(),
  searchContacts: vi.fn(),
  searchVisits: vi.fn(),
  searchFollowups: vi.fn(),
  getCustomerDetails: vi.fn(),
  getOpportunityDetails: vi.fn(),
  getProductDetails: vi.fn(),
  getQuoteDetails: vi.fn(),
  getOrderDetails: vi.fn(),
  getDashboardSummary: vi.fn(),
}));

import { executeReadActions } from "../platform/read-executor.js";

describe("platform proposal builder", () => {
  it("builds quote and followup blocks from write actions", () => {
    const proposal = buildProposalFromActions([
      {
        domain: "quotes",
        action: "create",
        kind: "write",
        confidence: 0.9,
        fields: { customerId: "customer-1", notes: "Enviar hoy" },
        humanSummary: "Crear cotización para Acme",
      },
      {
        domain: "followups",
        action: "create",
        kind: "write",
        confidence: 0.9,
        fields: { customerId: "customer-1", title: "Llamar", dueAt: "2026-05-08T10:00:00.000Z", type: "llamada" },
        humanSummary: "Crear seguimiento",
      },
    ]);

    expect(proposal.blocks.quote?.enabled).toBe(true);
    expect(proposal.blocks.quote?.customerId).toBe("customer-1");
    expect(proposal.blocks.followUp?.title).toBe("Llamar");
  });
});

describe("platform read executor", () => {
  it("executes quote search reads", async () => {
    const result = await executeReadActions("user-1", [
      {
        domain: "quotes",
        action: "search",
        kind: "read",
        confidence: 0.9,
        fields: { customerId: "customer-1", status: "abierta" },
      },
    ]);

    expect(mockSearchQuotes).toHaveBeenCalledWith({ customerId: "customer-1", status: "abierta" });
    expect(result.summary).toContain("1 resultado");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-actions.test.ts
```

Expected: FAIL because proposal builder and read executor do not exist.

- [ ] **Step 3: Add proposal builder**

Create `apps/agent-laura/src/platform/proposal-builder.ts`:

```ts
import type { ProposalPayload } from "../types.js";
import type { PlannedAction } from "./types.js";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function buildProposalFromActions(actions: PlannedAction[]): ProposalPayload {
  const blocks: ProposalPayload["blocks"] = {};

  for (const action of actions) {
    const fields = action.fields;

    if (action.domain === "customers") {
      blocks.customer = {
        legalName: asString(fields.legalName),
        displayName: asString(fields.displayName, undefined as unknown as string),
        phone: asString(fields.phone, undefined as unknown as string),
        email: asString(fields.email, undefined as unknown as string),
        address: asString(fields.address, undefined as unknown as string),
        notes: asString(fields.notes, undefined as unknown as string),
        enabled: true,
        action: action.action === "create" ? "create" : "update",
        id: asString(fields.id, undefined as unknown as string),
      };
    }

    if (action.domain === "contacts") {
      blocks.contact = {
        customerId: asString(fields.customerId),
        fullName: asString(fields.fullName),
        roleTitle: asString(fields.roleTitle, undefined as unknown as string),
        phone: asString(fields.phone, undefined as unknown as string),
        email: asString(fields.email, undefined as unknown as string),
        notes: asString(fields.notes, undefined as unknown as string),
        enabled: true,
        action: action.action === "create" ? "create" : "update",
        id: asString(fields.id, undefined as unknown as string),
      };
    }

    if (action.domain === "opportunities") {
      blocks.opportunity = {
        title: asString(fields.title, "Oportunidad"),
        stage: asString(fields.stage, "prospecto"),
        estimatedValue: asNumber(fields.estimatedValue),
        createNew: action.action === "create",
        opportunityId: asString(fields.id, undefined as unknown as string),
        enabled: true,
        action: action.action === "create" ? "create" : "update",
      };
    }

    if (action.domain === "quotes") {
      blocks.quote = {
        customerId: asString(fields.customerId),
        opportunityId: asString(fields.opportunityId, undefined as unknown as string),
        validUntil: asString(fields.validUntil, undefined as unknown as string),
        notes: asString(fields.notes, undefined as unknown as string),
        items: Array.isArray(fields.items) ? fields.items as Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }> : undefined,
        enabled: true,
        action: action.action === "create" ? "create" : "update",
        id: asString(fields.id, undefined as unknown as string),
      };
    }

    if (action.domain === "orders") {
      blocks.order = {
        customerId: asString(fields.customerId),
        opportunityId: asString(fields.opportunityId, undefined as unknown as string),
        sourceQuoteId: asString(fields.sourceQuoteId, undefined as unknown as string),
        notes: asString(fields.notes, undefined as unknown as string),
        items: Array.isArray(fields.items) ? fields.items as Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }> : undefined,
        enabled: true,
        action: action.action === "create" ? "create" : "update",
        id: asString(fields.id, undefined as unknown as string),
      };
    }

    if (action.domain === "products") {
      blocks.product = {
        sku: asString(fields.sku),
        name: asString(fields.name),
        description: asString(fields.description, undefined as unknown as string),
        unit: asString(fields.unit, undefined as unknown as string),
        presentation: asString(fields.presentation, undefined as unknown as string),
        basePrice: asNumber(fields.basePrice),
        enabled: true,
        action: action.action === "create" ? "create" : "update",
        id: asString(fields.id, undefined as unknown as string),
      };
    }

    if (action.domain === "segments") {
      blocks.segment = {
        name: asString(fields.name),
        description: asString(fields.description, undefined as unknown as string),
        enabled: true,
        action: action.action === "create" ? "create" : "update",
        id: asString(fields.id, undefined as unknown as string),
      };
    }

    if (action.domain === "visits") {
      blocks.visit = {
        customerId: asString(fields.customerId),
        opportunityId: asString(fields.opportunityId, undefined as unknown as string),
        scheduledAt: asString(fields.scheduledAt),
        summary: asString(fields.summary, undefined as unknown as string),
        notes: asString(fields.notes, undefined as unknown as string),
        enabled: true,
        action: "update",
        id: asString(fields.id),
      };
    }

    if (action.domain === "followups") {
      blocks.followUp = {
        customerId: asString(fields.customerId),
        title: asString(fields.title, "Seguimiento"),
        dueAt: asString(fields.dueAt),
        type: asString(fields.type, "llamada"),
        notes: asString(fields.notes, undefined as unknown as string),
        enabled: true,
        action: action.action === "create" ? "create" : "update",
        id: asString(fields.id, undefined as unknown as string),
      };
    }
  }

  return { blocks };
}
```

- [ ] **Step 4: Add read executor**

Create `apps/agent-laura/src/platform/read-executor.ts`:

```ts
import {
  getCustomerDetails,
  getDashboardSummary,
  getOpportunityDetails,
  getOrderDetails,
  getProductDetails,
  getQuoteDetails,
  searchContacts,
  searchCustomers,
  searchFollowups,
  searchOpportunities,
  searchOrders,
  searchProducts,
  searchQuotes,
  searchSegments,
  searchVisits,
} from "../tools/nestjs-client.js";
import type { DataResult } from "../types.js";
import type { PlannedAction } from "./types.js";

function fieldString(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function fieldBoolean(fields: Record<string, unknown>, key: string): boolean | undefined {
  const value = fields[key];
  return typeof value === "boolean" ? value : undefined;
}

async function executeOne(userId: string, action: PlannedAction): Promise<unknown> {
  const fields = action.fields;

  if (action.domain === "customers" && action.action === "search") return searchCustomers(fieldString(fields, "search") ?? "");
  if (action.domain === "customers" && action.action === "detail") return getCustomerDetails(fieldString(fields, "customerId") ?? "");
  if (action.domain === "opportunities" && action.action === "search") return searchOpportunities(fieldString(fields, "search") ?? "");
  if (action.domain === "opportunities" && action.action === "detail") return getOpportunityDetails(fieldString(fields, "opportunityId") ?? "");
  if (action.domain === "products" && action.action === "search") return searchProducts({ search: fieldString(fields, "search"), active: fieldBoolean(fields, "active") });
  if (action.domain === "products" && action.action === "detail") return getProductDetails(fieldString(fields, "productId") ?? "");
  if (action.domain === "quotes" && action.action === "search") return searchQuotes({ customerId: fieldString(fields, "customerId"), status: fieldString(fields, "status"), search: fieldString(fields, "search") });
  if (action.domain === "quotes" && action.action === "detail") return getQuoteDetails(fieldString(fields, "quoteId") ?? "");
  if (action.domain === "orders" && action.action === "search") return searchOrders({ customerId: fieldString(fields, "customerId"), status: fieldString(fields, "status"), search: fieldString(fields, "search") });
  if (action.domain === "orders" && action.action === "detail") return getOrderDetails(fieldString(fields, "orderId") ?? "");
  if (action.domain === "segments" && action.action === "search") return searchSegments();
  if (action.domain === "contacts" && action.action === "search") return searchContacts({ search: fieldString(fields, "search"), customerId: fieldString(fields, "customerId") });
  if (action.domain === "visits" && action.action === "search") return searchVisits({ customerId: fieldString(fields, "customerId"), status: fieldString(fields, "status"), dateFrom: fieldString(fields, "dateFrom"), dateTo: fieldString(fields, "dateTo") });
  if (action.domain === "followups" && action.action === "search") return searchFollowups({ customerId: fieldString(fields, "customerId"), status: fieldString(fields, "status") });
  if (action.domain === "dashboard" && action.action === "detail") return getDashboardSummary(fieldString(fields, "userId") ?? userId);

  return { error: `No read executor for ${action.domain}.${action.action}` };
}

export async function executeReadActions(userId: string, actions: PlannedAction[]): Promise<DataResult> {
  const results = [];

  for (const action of actions) {
    const data = await executeOne(userId, action);
    results.push({ action: `${action.domain}.${action.action}`, data });
  }

  const count = results.reduce((sum, result) => Array.isArray(result.data) ? sum + result.data.length : sum + 1, 0);

  return {
    entityType: actions.map((action) => action.domain).join(","),
    action: actions.length === 1 && actions[0]?.action === "detail" ? "detail" : "list",
    data: results.length === 1 ? results[0]?.data : results,
    summary: `${count} resultado${count === 1 ? "" : "s"} encontrado${count === 1 ? "" : "s"}.`,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/platform-actions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/agent-laura/src/platform/proposal-builder.ts apps/agent-laura/src/platform/read-executor.ts apps/agent-laura/src/__tests__/platform-actions.test.ts
git commit -m "feat(laura): map platform plans to reads and proposals"
```

---

### Task 4: Add Platform Graph Node And Route Main CRM Requests Through It

**Files:**
- Create: `apps/agent-laura/src/graph/nodes/platform.ts`
- Modify: `apps/agent-laura/src/types.ts`
- Modify: `apps/agent-laura/src/graph/graph.ts`
- Modify: `apps/agent-laura/src/graph/edges.ts`
- Modify: `apps/agent-laura/src/graph/nodes/router.ts`
- Test: `apps/agent-laura/src/__tests__/agent-nodes.test.ts`

- [ ] **Step 1: Add tests for platform routing**

Modify `apps/agent-laura/src/__tests__/agent-nodes.test.ts` by adding these imports near the existing node imports:

```ts
import { platformNode } from "../graph/nodes/platform.js";
```

Add this test block near the router tests:

```ts
describe("Router — Platform mode", () => {
  it("routes CRM operation messages to platform instead of keyword-specific modes", async () => {
    const state = makeState({ messages: [new HumanMessage("Creale una cotización a Acme y dejame seguimiento para el viernes")] });

    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("still routes active proposal confirmation before platform planning", async () => {
    const state = makeState({
      messages: [new HumanMessage("confirmo")],
      proposalStatus: "draft",
      proposal: makeProposal(),
    });

    expect((await routerNode(state)).mode).toBe("confirm");
  });
});

describe("Platform node", () => {
  it("returns clarification when validation finds missing fields", async () => {
    mockCreateLlm.mockReturnValueOnce({
      invoke: vi.fn().mockResolvedValue(new AIMessage(JSON.stringify({
        intent: "write",
        actions: [
          { domain: "followups", action: "create", kind: "write", confidence: 0.9, fields: { title: "Llamar" } }
        ],
        missingFields: [],
        ambiguity: [],
        confidence: 0.9
      }))),
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("dejame un seguimiento")] }));

    expect(result.mode).toBe("clarification");
    expect(result.messages?.at(-1)?.content).toContain("faltan");
  });

  it("returns proposal for validated write plans", async () => {
    mockCreateLlm.mockReturnValueOnce({
      invoke: vi.fn().mockResolvedValue(new AIMessage(JSON.stringify({
        intent: "write",
        actions: [
          {
            domain: "quotes",
            action: "create",
            kind: "write",
            confidence: 0.9,
            fields: { customerId: "customer-1", notes: "Enviar hoy" },
            humanSummary: "Crear cotización"
          }
        ],
        missingFields: [],
        ambiguity: [],
        confidence: 0.9
      }))),
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("crea una cotización")], customerContext: { id: "customer-1", label: "Acme" } }));

    expect(result.mode).toBe("proposal");
    expect(result.proposal?.blocks.quote?.customerId).toBe("customer-1");
  });
});
```

Then update existing brittle expectations that depend on `cliente`/`cotizacion` keyword bugs:

```ts
expect((await routerNode(state)).mode).toBe("platform");
```

Use that replacement for tests whose descriptions say `keyword catch`, `LIMITACIÓN`, or expect reports to be `query` because they contain generic entity words.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @norgtech/agent-laura test -- src/__tests__/agent-nodes.test.ts
```

Expected: FAIL because `platformNode` and `platform` mode do not exist yet.

- [ ] **Step 3: Add platform mode to types**

Modify `apps/agent-laura/src/types.ts`:

```ts
export type AgentMode =
  | "greeting"
  | "clarification"
  | "proposal"
  | "agenda"
  | "confirm"
  | "discard"
  | "refine"
  | "qa"
  | "query"
  | "modify"
  | "platform";
```

- [ ] **Step 4: Add platform node**

Create `apps/agent-laura/src/graph/nodes/platform.ts`:

```ts
import { AIMessage } from "@langchain/core/messages";
import type { LauraState } from "../state.js";
import { buildPlatformContext } from "../../platform/context.js";
import { planPlatformIntent } from "../../platform/planner.js";
import { validatePlatformPlan } from "../../platform/validator.js";
import { executeReadActions } from "../../platform/read-executor.js";
import { buildProposalFromActions } from "../../platform/proposal-builder.js";

function answerForData(summary: string): string {
  return summary || "Encontré información para tu consulta.";
}

export async function platformNode(state: LauraState): Promise<Partial<LauraState>> {
  const context = buildPlatformContext(state);
  const plan = await planPlatformIntent(context);

  if (plan.intent === "greeting") {
    return {
      mode: "greeting",
      messages: [new AIMessage(plan.answer ?? "Hola, soy Laura. ¿Qué querés hacer en el CRM?")],
    };
  }

  if (plan.intent === "help") {
    return {
      mode: "qa",
      messages: [new AIMessage(plan.answer ?? "Puedo ayudarte a consultar, crear y actualizar clientes, contactos, oportunidades, visitas, seguimientos, cotizaciones, pedidos, productos y segmentos. Las acciones que cambian datos siempre te las muestro para confirmar antes de guardar.")],
    };
  }

  if (plan.intent === "unsupported") {
    return {
      mode: "qa",
      messages: [new AIMessage(plan.answer ?? "Esa acción no está disponible desde Laura. Puedo ayudarte a consultar registros o preparar cambios confirmables en los módulos del CRM.")],
    };
  }

  const validation = validatePlatformPlan(plan);

  if (!validation.ok) {
    return {
      mode: "clarification",
      clarificationOptions: {
        type: "action",
        options: [],
      },
      messages: [new AIMessage(validation.clarificationQuestion ?? validation.errors[0] ?? "Necesito un dato más para avanzar.")],
    };
  }

  if (validation.executableReads.length > 0 && validation.proposalWrites.length === 0) {
    const data = await executeReadActions(state.userId, validation.executableReads);
    return {
      mode: "query",
      data,
      messages: [new AIMessage(answerForData(data.summary))],
    };
  }

  if (validation.proposalWrites.length > 0) {
    const proposal = buildProposalFromActions(validation.proposalWrites);
    const proposalId = state.proposalId ?? crypto.randomUUID();
    const readPrefix = validation.executableReads.length > 0
      ? "También encontré información relacionada, pero preparé los cambios para que los revises."
      : "Preparé una propuesta compacta para que la revises antes de guardar.";

    return {
      mode: "proposal",
      proposal,
      proposalId,
      proposalStatus: "draft",
      messages: [new AIMessage(readPrefix)],
    };
  }

  return {
    mode: "clarification",
    messages: [new AIMessage("No llegué a identificar una acción concreta. ¿Querés consultar, crear o actualizar algo?")],
  };
}
```

- [ ] **Step 5: Wire graph and edge**

Modify `apps/agent-laura/src/graph/graph.ts`:

```ts
import { platformNode } from "./nodes/platform.js";
```

Add the node:

```ts
.addNode("platform", platformNode);
```

Add the conditional route:

```ts
platform: "platform",
```

Add the terminal edge:

```ts
.addEdge("platform", END)
```

Modify `apps/agent-laura/src/graph/edges.ts`:

```ts
    case "platform":
      return "platform";
```

- [ ] **Step 6: Simplify router default path**

Modify `apps/agent-laura/src/graph/nodes/router.ts`:

```ts
function classifyWithHeuristics(
  content: string,
  state: LauraState,
): "greeting" | "agenda" | "clarification" | "proposal" | "confirm" | "discard" | "refine" | "qa" | "query" | "modify" | "platform" {
```

Keep active proposal handling first, but check discard before confirm:

```ts
  if (hasActiveProposal) {
    const discardPatterns = [
      "cancelar", "cancela", "descartar", "descarta", "no guardar",
      "no lo guardes", "borrar", "borra", "eliminar", "elimina",
    ];
    if (discardPatterns.some((p) => normalized === p || normalized.includes(p))) {
      return "discard";
    }

    const confirmPatterns = [
      "confirmo", "confirmar", "si confirmo", "si, confirmo",
      "si confirmo", "guardalo", "guarda todo", "guardalo todo",
      "ok guardalo", "dale guardalo",
    ];
    if (confirmPatterns.some((p) => normalized === p || normalized.includes(p))) {
      return "confirm";
    }
```

Remove `queryKeywords`, `modifyKeywords`, and broad `agendaKeywords` routing from the main path. Keep only obvious agenda shortcuts:

```ts
  const directAgendaRequests = [
    "agenda",
    "mis pendientes",
    "pendientes de hoy",
    "que tengo hoy",
    "que tengo pendiente",
    "que tengo programado",
  ];
  if (directAgendaRequests.some((k) => normalized === k || normalized.includes(k))) {
    return "agenda";
  }

  return "platform";
```

- [ ] **Step 7: Run agent tests**

Run:

```bash
pnpm --filter @norgtech/agent-laura test
```

Expected: PASS after updating brittle router expectations to `platform` or behavior-oriented assertions.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/agent-laura/src/types.ts apps/agent-laura/src/graph/graph.ts apps/agent-laura/src/graph/edges.ts apps/agent-laura/src/graph/nodes/router.ts apps/agent-laura/src/graph/nodes/platform.ts apps/agent-laura/src/__tests__/agent-nodes.test.ts
git commit -m "feat(laura): route CRM requests through platform planner"
```

---

### Task 5: Add Compact Proposal Summary UI

**Files:**
- Create: `apps/web/src/components/laura/laura-proposal-summary.tsx`
- Modify: `apps/web/src/components/laura/laura-proposal-card.tsx`
- Test: `apps/web/tests/e2e/laura.spec.ts`

- [ ] **Step 1: Add E2E expectation for compact proposal**

Modify `apps/web/tests/e2e/laura.spec.ts` by adding a test in the Laura describe block:

```ts
test("shows proposal as compact summary before expanding details", async ({ page }) => {
  await page.goto("/laura");

  await page.route("**/laura/messages/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        "event: result",
        `data: ${JSON.stringify({
          mode: "proposal",
          sessionId: "session-1",
          message: "Preparé una propuesta compacta para que la revises antes de guardar.",
          proposalId: "proposal-1",
          proposal: {
            blocks: {
              quote: { customerId: "customer-1", notes: "Enviar hoy", enabled: true, action: "create", items: [{ productId: "product-1", quantity: 3, unitPrice: 100 }] },
              followUp: { customerId: "customer-1", title: "Llamar para revisar cotización", dueAt: "2026-05-08T10:00:00.000Z", type: "llamada", enabled: true, action: "create" }
            }
          }
        })}`,
        "",
        "event: done",
        "data: {\"ok\":true}",
        "",
      ].join("\n"),
    });
  });

  await page.getByPlaceholder("Escribí un mensaje para Laura").fill("Creá una cotización y seguimiento");
  await page.getByRole("button", { name: /enviar/i }).click();

  await expect(page.getByText("Laura preparó 2 acciones para confirmar")).toBeVisible();
  await expect(page.getByText("Crear cotización")).toBeVisible();
  await expect(page.getByText("Crear seguimiento")).toBeVisible();
  await expect(page.getByLabel("Notas")).toHaveCount(0);

  await page.getByRole("button", { name: /editar/i }).first().click();
  await expect(page.getByLabel("Notas")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E test to verify it fails**

Run:

```bash
pnpm --filter @norgtech/web test -- laura.spec.ts
```

Expected: FAIL because compact summary UI does not exist or selectors differ.

- [ ] **Step 3: Create compact summary component**

Create `apps/web/src/components/laura/laura-proposal-summary.tsx`:

```tsx
"use client";

import { ChevronDown, ChevronRight, FileText, Phone, ShoppingCart, User, Users, Package, Target, CalendarClock } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import type { LauraProposalPayload } from "./laura-types";

type ProposalAction = {
  key: keyof LauraProposalPayload["blocks"];
  title: string;
  summary: string;
  enabled: boolean;
};

function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha por revisar";
  return date.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
}

function proposalActions(proposal: LauraProposalPayload): ProposalAction[] {
  const blocks = proposal.blocks;
  const actions: ProposalAction[] = [];

  if (blocks.customer) actions.push({ key: "customer", title: blocks.customer.action === "create" ? "Crear cliente" : "Actualizar cliente", summary: blocks.customer.displayName || blocks.customer.legalName || "Cliente por revisar", enabled: blocks.customer.enabled });
  if (blocks.contact) actions.push({ key: "contact", title: blocks.contact.action === "create" ? "Crear contacto" : "Actualizar contacto", summary: blocks.contact.fullName || "Contacto por revisar", enabled: blocks.contact.enabled });
  if (blocks.opportunity) actions.push({ key: "opportunity", title: blocks.opportunity.createNew ? "Crear oportunidad" : "Actualizar oportunidad", summary: `${blocks.opportunity.title ?? "Oportunidad"} · ${blocks.opportunity.stage ?? "Etapa por revisar"}`, enabled: blocks.opportunity.enabled });
  if (blocks.quote) actions.push({ key: "quote", title: blocks.quote.action === "create" ? "Crear cotización" : "Actualizar cotización", summary: `${blocks.quote.items?.length ?? 0} ítem${blocks.quote.items?.length === 1 ? "" : "s"} · ${blocks.quote.notes ?? "Sin notas"}`, enabled: blocks.quote.enabled });
  if (blocks.order) actions.push({ key: "order", title: blocks.order.action === "create" ? "Crear pedido" : "Actualizar pedido", summary: `${blocks.order.items?.length ?? 0} ítem${blocks.order.items?.length === 1 ? "" : "s"} · ${blocks.order.notes ?? "Sin notas"}`, enabled: blocks.order.enabled });
  if (blocks.product) actions.push({ key: "product", title: blocks.product.action === "create" ? "Crear producto" : "Actualizar producto", summary: blocks.product.name || blocks.product.sku || "Producto por revisar", enabled: blocks.product.enabled });
  if (blocks.segment) actions.push({ key: "segment", title: blocks.segment.action === "create" ? "Crear segmento" : "Actualizar segmento", summary: blocks.segment.name || "Segmento por revisar", enabled: blocks.segment.enabled });
  if (blocks.visit) actions.push({ key: "visit", title: "Actualizar visita", summary: `${formatDate(blocks.visit.scheduledAt)} · ${blocks.visit.summary ?? "Sin resumen"}`, enabled: blocks.visit.enabled });
  if (blocks.followUp) actions.push({ key: "followUp", title: blocks.followUp.action === "update" ? "Actualizar seguimiento" : "Crear seguimiento", summary: `${formatDate(blocks.followUp.dueAt)} · ${blocks.followUp.title}`, enabled: blocks.followUp.enabled });
  if (blocks.task) actions.push({ key: "task", title: "Crear tarea interna", summary: `${formatDate(blocks.task.dueAt)} · ${blocks.task.title}`, enabled: blocks.task.enabled });
  if (blocks.interaction) actions.push({ key: "interaction", title: "Registrar interacción", summary: blocks.interaction.summary, enabled: blocks.interaction.enabled });
  if (blocks.signals) actions.push({ key: "signals", title: "Guardar señales comerciales", summary: `${blocks.signals.objections.length} objeción${blocks.signals.objections.length === 1 ? "" : "es"}`, enabled: blocks.signals.enabled });

  return actions;
}

function iconForAction(key: ProposalAction["key"]) {
  if (key === "customer") return User;
  if (key === "contact") return Users;
  if (key === "opportunity") return Target;
  if (key === "quote") return FileText;
  if (key === "order") return ShoppingCart;
  if (key === "product") return Package;
  if (key === "followUp" || key === "visit" || key === "task") return CalendarClock;
  return FileText;
}

export function LauraProposalSummary({
  proposal,
  expandedKey,
  onExpand,
}: {
  proposal: LauraProposalPayload;
  expandedKey: string | null;
  onExpand: (key: string | null) => void;
}) {
  const actions = proposalActions(proposal);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: crmTheme.laura.textPrimary }}>
        Laura preparó {actions.length} accion{actions.length === 1 ? "" : "es"} para confirmar
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {actions.map((action) => {
          const Icon = iconForAction(action.key);
          const expanded = expandedKey === action.key;

          return (
            <button
              key={action.key}
              type="button"
              onClick={() => onExpand(expanded ? null : action.key)}
              aria-expanded={expanded}
              aria-label={`Editar ${action.title}`}
              style={{
                width: "100%",
                minHeight: 58,
                display: "grid",
                gridTemplateColumns: "28px 1fr 18px",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                border: `1px solid ${action.enabled ? crmTheme.laura.border : crmTheme.colors.border}`,
                borderRadius: crmTheme.radius.sm,
                background: action.enabled ? crmTheme.colors.surface : crmTheme.colors.surfaceMuted,
                padding: "9px 10px",
                cursor: "pointer",
                opacity: action.enabled ? 1 : 0.6,
              }}
            >
              <span style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 8, background: crmTheme.laura.soft }}>
                <Icon size={15} color={crmTheme.laura.primary} />
              </span>
              <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: crmTheme.laura.textPrimary }}>{action.title}</span>
                <span style={{ fontSize: 12, color: crmTheme.laura.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {action.summary}
                </span>
              </span>
              {expanded ? <ChevronDown size={16} color={crmTheme.laura.textMuted} /> : <ChevronRight size={16} color={crmTheme.laura.textMuted} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrate summary into proposal card**

Modify `apps/web/src/components/laura/laura-proposal-card.tsx`:

Add import:

```tsx
import { useState } from "react";
import { LauraProposalSummary } from "./laura-proposal-summary";
```

Inside `LauraProposalCard`, add state:

```tsx
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
```

Immediately inside the blocks container, before rendering individual blocks, add:

```tsx
        <LauraProposalSummary
          proposal={proposal}
          expandedKey={expandedKey}
          onExpand={setExpandedKey}
        />
```

Wrap each block render condition with expanded checks. Example:

```tsx
        {proposal.blocks.interaction && expandedKey === "interaction" && (
```

Apply the same pattern:

```tsx
expandedKey === "opportunity"
expandedKey === "followUp"
expandedKey === "task"
expandedKey === "signals"
expandedKey === "customer"
expandedKey === "contact"
expandedKey === "quote"
expandedKey === "order"
expandedKey === "product"
expandedKey === "segment"
expandedKey === "visit"
```

Keep the confirm button area unchanged so the user can confirm from the compact default view.

- [ ] **Step 5: Run web tests**

Run:

```bash
pnpm --filter @norgtech/web test -- laura.spec.ts
```

Expected: PASS after selector adjustments if the existing test harness names the composer differently.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/src/components/laura/laura-proposal-summary.tsx apps/web/src/components/laura/laura-proposal-card.tsx apps/web/tests/e2e/laura.spec.ts
git commit -m "feat(laura): show compact proposal confirmations"
```

---

### Task 6: Full Verification And Cleanup

**Files:**
- Modify only files touched in prior tasks if verification finds type or lint errors.

- [ ] **Step 1: Run agent tests**

Run:

```bash
pnpm --filter @norgtech/agent-laura test
```

Expected: PASS.

- [ ] **Step 2: Run agent build**

Run:

```bash
pnpm --filter @norgtech/agent-laura build
```

Expected: PASS.

- [ ] **Step 3: Run web build**

Run:

```bash
pnpm --filter @norgtech/web build
```

Expected: PASS.

- [ ] **Step 4: Run full workspace tests if available**

Run:

```bash
pnpm test
```

Expected: PASS, or existing unrelated failures documented with exact failing test names.

- [ ] **Step 5: Manual chat smoke test**

Start the app stack with the project's normal dev command:

```bash
pnpm dev
```

In the browser, test these messages:

```text
Qué cotizaciones abiertas tiene Acme?
```

Expected: Laura answers directly, without proposal.

```text
Creale una cotización a Acme por 3 aireadores y dejame seguimiento para el viernes.
```

Expected: Laura asks for product clarification if the product is ambiguous, or shows a compact proposal if enough data exists.

```text
no guardar
```

Expected with active proposal: Laura discards, not confirms.

- [ ] **Step 6: Final commit if fixes were needed**

If verification required fixes, commit them:

```bash
git add apps/agent-laura apps/web
git commit -m "fix(laura): stabilize platform agent verification"
```

If no fixes were needed, skip this commit.

---

## Self-Review

Spec coverage:

- Capability registry: Task 1.
- Context-aware planner: Task 2.
- Validation and clarification: Task 2 and Task 4.
- Read direct execution: Task 3 and Task 4.
- Write confirmation proposals: Task 3 and Task 4.
- Compact progressive proposal UI: Task 5.
- Conversation tests: Tasks 2, 3, 4, and 5.
- Verification: Task 6.

Placeholder scan:

- No undefined filler steps are intentionally included.
- Every created file has code content.
- Every test step includes a command and expected result.

Type consistency:

- `PlatformPlan`, `PlannedAction`, and `ValidationResult` are defined in Task 1 and reused consistently.
- `platform` mode is added before graph routing uses it.
- Proposal builder returns the existing `ProposalPayload` shape consumed by the current API and frontend.
