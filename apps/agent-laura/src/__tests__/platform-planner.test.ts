import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LauraState } from "../graph/state.js";
import type { PlannedAction, PlatformPlan } from "../platform/types.js";

const { mockInvoke, mockCreateLlm } = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  return {
    mockInvoke,
    mockCreateLlm: vi.fn(() => ({ invoke: mockInvoke })),
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
