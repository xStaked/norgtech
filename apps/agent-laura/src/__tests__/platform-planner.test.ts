import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LauraState } from "../graph/state.js";
import type { PlannedAction, PlatformPlan } from "../platform/types.js";

const { mockInvoke, mockBindTools, mockCreateLlm } = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockBindTools = vi.fn();
  return {
    mockInvoke,
    mockBindTools,
    mockCreateLlm: vi.fn(() => ({ bindTools: mockBindTools, invoke: mockInvoke })),
  };
});

vi.mock("../config/providers.js", () => ({
  createLlm: mockCreateLlm,
}));

import { buildPlatformContext } from "../platform/context.js";
import { planPlatformIntent } from "../platform/planner.js";
import { validatePlatformPlan } from "../platform/validator.js";

function makeState(overrides: Partial<LauraState> = {}): LauraState {
  return {
    sessionId: "session-1",
    userId: "user-1",
    messages: [new HumanMessage("buscar clientes acme")],
    mode: "query",
    customerContext: null,
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
    vi.clearAllMocks();
  });

  it("buildPlatformContext extracts userId, customerContext, and currentMessage", () => {
    const context = buildPlatformContext(
      makeState({
        userId: "seller-1",
        customerContext: { id: "customer-1", label: "Acme Piscicola" },
        messages: [
          new SystemMessage("system note"),
          new HumanMessage({ content: [{ type: "text", text: "mostrame el cliente Acme" }] }),
        ],
      }),
    );

    expect(context.userId).toBe("seller-1");
    expect(context.customerContext).toEqual({ id: "customer-1", label: "Acme Piscicola" });
    expect(context.currentMessage).toBe("mostrame el cliente Acme");
  });

  it("buildPlatformContext keeps only the last 8 recent messages", () => {
    const context = buildPlatformContext(
      makeState({
        messages: Array.from({ length: 10 }, (_, index) => new HumanMessage(`mensaje ${index + 1}`)),
      }),
    );

    expect(context.recentMessages).toEqual([
      "mensaje 3",
      "mensaje 4",
      "mensaje 5",
      "mensaje 6",
      "mensaje 7",
      "mensaje 8",
      "mensaje 9",
      "mensaje 10",
    ]);
    expect(context.currentMessage).toBe("mensaje 10");
  });

  it("buildPlatformContext creates agenda summary", () => {
    const context = buildPlatformContext(
      makeState({
        agendaItems: [
          { id: "visit-1", type: "visit", label: "Visita Acme", scheduledAt: "2026-05-10T10:00:00.000Z" },
          { id: "follow-1", type: "follow_up_task", label: "Llamar a Beta" },
        ],
      }),
    );

    expect(context.agendaSummary).toContain("visit: Visita Acme @ 2026-05-10T10:00:00.000Z");
    expect(context.agendaSummary).toContain("follow_up_task: Llamar a Beta");
  });

  it("buildPlatformContext includes activeProposal only for draft proposals and null otherwise", () => {
    const proposal = {
      blocks: {
        followUp: {
          enabled: true,
          title: "Llamar a Acme",
          dueAt: "2026-05-10T10:00:00.000Z",
          type: "llamada",
        },
      },
    };

    expect(buildPlatformContext(makeState({ proposal, proposalStatus: "draft" })).activeProposal).toEqual(proposal);
    expect(buildPlatformContext(makeState({ proposal, proposalStatus: "confirmed" })).activeProposal).toBeNull();
    expect(buildPlatformContext(makeState({ proposal, proposalStatus: "discarded" })).activeProposal).toBeNull();
  });

  it("planPlatformIntent parses a strict JSON read plan from the mocked LLM", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "read",
          summary: "Buscar clientes por Acme",
          actions: [
            {
              domain: "customers",
              action: "search",
              arguments: { query: "Acme" },
              confidence: 0.91,
            },
          ],
          requiresConfirmation: false,
        }),
      }),
    );

    const plan = await planPlatformIntent(buildPlatformContext(makeState()));

    expect(plan.intent).toBe("read");
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      domain: "customers",
      action: "search",
      toolName: "search_customers",
      arguments: { query: "Acme" },
    });
    expect(mockInvoke).toHaveBeenCalledWith(expect.arrayContaining([expect.any(SystemMessage), expect.any(HumanMessage)]));
  });

  it("invalid LLM JSON falls back to clarification with repetir", async () => {
    mockInvoke.mockResolvedValueOnce(new AIMessage("```json\n{ bad json\n```"));

    const plan = await planPlatformIntent(buildPlatformContext(makeState()));

    expect(plan.intent).toBe("clarification");
    expect(plan.clarificationQuestion).toContain("repetir");
  });

  it("invalid LLM intent falls back to clarification", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "admin",
          summary: "Intento no soportado",
          actions: [],
          requiresConfirmation: false,
        }),
      }),
    );

    const plan = await planPlatformIntent(buildPlatformContext(makeState()));

    expect(plan.intent).toBe("clarification");
    expect(plan.clarificationQuestion).toContain("repetir");
  });

  it("planPlatformIntent parses JSON wrapped in markdown fences", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: `\`\`\`json
{
  "intent": "read",
  "summary": "Buscar cotizaciones",
  "actions": [
    {
      "domain": "quotes",
      "action": "search",
      "arguments": { "customerId": "customer-1" },
      "confidence": 0.82
    }
  ],
  "requiresConfirmation": false
}
\`\`\``,
      }),
    );

    const plan = await planPlatformIntent(
      buildPlatformContext(makeState({ customerContext: { id: "customer-1", label: "Acme Piscicola" } })),
    );

    expect(plan.intent).toBe("read");
    expect(plan.actions[0]).toMatchObject({
      domain: "quotes",
      action: "search",
      toolName: "search_quotes",
      arguments: { customerId: "customer-1" },
    });
  });

  it("prompt passed to LLM includes Laura identity, capabilities, and compact context", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "read",
          summary: "Buscar cotizaciones del cliente",
          actions: [],
          requiresConfirmation: false,
        }),
      }),
    );

    await planPlatformIntent(
      buildPlatformContext(
        makeState({
          customerContext: { id: "customer-1", label: "Acme Piscicola" },
          messages: [new HumanMessage("mostrame cotizaciones")],
        }),
      ),
    );

    const [messages] = mockInvoke.mock.calls[0];
    expect(messages[0].content).toContain("Sos Laura, la asistente comercial del CRM de Norgtech");
    expect(messages[0].content).toContain("quotes.create");
    expect(messages[1].content).toContain("customer-1");
  });

  it("planner does not execute or bind tools", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "read",
          summary: "Buscar clientes",
          actions: [],
          requiresConfirmation: false,
        }),
      }),
    );

    const plan = await planPlatformIntent(buildPlatformContext(makeState()));

    expect(plan.intent).toBe("read");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockBindTools).not.toHaveBeenCalled();
  });

  it("validatePlatformPlan accepts read plans into executableReads", () => {
    const plan: PlatformPlan = {
      intent: "read",
      summary: "Buscar clientes",
      actions: [
        {
          domain: "customers",
          action: "search",
          toolName: "search_customers",
          arguments: { query: "Acme" },
          requiredFields: [],
          missingFields: [],
          requiresConfirmation: false,
        },
      ],
      requiresConfirmation: false,
    };

    const result = validatePlatformPlan(plan);

    expect(result.ok).toBe(true);
    expect(result.executableReads).toEqual(plan.actions);
    expect(result.proposalWrites).toEqual([]);
  });

  it("write plans go into proposalWrites", () => {
    const action: PlannedAction = {
      domain: "followups",
      action: "create",
      toolName: "create_followup",
      arguments: {
        customerId: "customer-1",
        title: "Llamar a Acme",
        dueAt: "2026-05-10T10:00:00.000Z",
        type: "llamada",
      },
      requiredFields: ["customerId", "title", "dueAt", "type"],
      missingFields: [],
      requiresConfirmation: true,
    };

    const result = validatePlatformPlan({
      intent: "write",
      summary: "Crear seguimiento",
      actions: [action],
      requiresConfirmation: true,
    });

    expect(result.ok).toBe(true);
    expect(result.executableReads).toEqual([]);
    expect(result.proposalWrites).toEqual([action]);
  });

  it("low confidence below 0.45 returns clarification and ok false", () => {
    const result = validatePlatformPlan({
      intent: "read",
      summary: "Buscar clientes con baja confianza",
      actions: [
        {
          domain: "customers",
          action: "search",
          toolName: "search_customers",
          arguments: { query: "Acme" },
          requiredFields: [],
          missingFields: [],
          requiresConfirmation: false,
          confidence: 0.44,
        },
      ],
      requiresConfirmation: false,
    });

    expect(result.ok).toBe(false);
    expect(result.clarificationQuestion).toBeDefined();
    expect(result.executableReads).toEqual([]);
    expect(result.proposalWrites).toEqual([]);
  });

  it("unsupported orders.bulk_delete is rejected with a Spanish availability error", () => {
    const result = validatePlatformPlan({
      intent: "write",
      summary: "Eliminar pedidos",
      actions: [
        {
          domain: "orders",
          action: "bulk_delete",
          toolName: "bulk_delete_orders",
          arguments: { olderThan: "2025-01-01" },
          requiredFields: [],
          missingFields: [],
          requiresConfirmation: true,
        },
      ],
      requiresConfirmation: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("no está disponible");
  });

  it("missing required fields on followups.create returns missingFields exactly customerId, dueAt, type when title exists", () => {
    const result = validatePlatformPlan({
      intent: "write",
      summary: "Crear seguimiento",
      actions: [
        {
          domain: "followups",
          action: "create",
          toolName: "create_followup",
          arguments: { title: "Llamar a Acme" },
          requiredFields: ["customerId", "title", "dueAt", "type"],
          missingFields: [],
          requiresConfirmation: true,
        },
      ],
      requiresConfirmation: true,
    });

    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual(["customerId", "dueAt", "type"]);
  });
});
