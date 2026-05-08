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
import { platformNode } from "../graph/nodes/platform.js";

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

  it("buildPlatformContext keeps the last 16 recent messages for conversational references", () => {
    const context = buildPlatformContext(
      makeState({
        messages: Array.from({ length: 18 }, (_, index) => new HumanMessage(`mensaje ${index + 1}`)),
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
      "mensaje 11",
      "mensaje 12",
      "mensaje 13",
      "mensaje 14",
      "mensaje 15",
      "mensaje 16",
      "mensaje 17",
      "mensaje 18",
    ]);
    expect(context.currentMessage).toBe("mensaje 18");
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

  it("preserves balanced commercial write planning across visits and followups", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "write",
          summary: "Reprogramar visita y mover seguimiento asociado",
          actions: [
            {
              domain: "visits",
              action: "update",
              kind: "write",
              fields: {
                visitId: "visit-1",
                scheduledAt: "2026-05-15T10:00:00.000Z",
              },
              role: "primary",
              humanSummary: "Mover visita principal",
              confidence: 0.93,
            },
            {
              domain: "followups",
              action: "update",
              kind: "write",
              fields: {
                followupId: "followup-1",
                dueAt: "2026-05-16T09:00:00.000Z",
                title: "Mover seguimiento post visita",
              },
              role: "related",
              relatedTo: "visit-1",
              humanSummary: "Mover seguimiento relacionado",
              confidence: 0.9,
            },
          ],
          requiresConfirmation: true,
          confidence: 0.91,
          responseStyle: "adaptive",
        }),
      }),
    );

    const plan = await planPlatformIntent(buildPlatformContext(makeState({
      messages: [new HumanMessage("Reprograma la visita del jueves y move tambien el seguimiento")],
    })));

    expect(plan.intent).toBe("write");
    expect(plan.confidence).toBe(0.91);
    expect(plan.responseStyle).toBe("adaptive");
    expect(plan.actions.map((action) => action.domain)).toEqual(["visits", "followups"]);
    expect(plan.actions).toMatchObject([
      {
        action: "update",
        toolName: "update_visit",
        arguments: { visitId: "visit-1", scheduledAt: "2026-05-15T10:00:00.000Z" },
        role: "primary",
        humanSummary: "Mover visita principal",
      },
      {
        action: "update",
        toolName: "update_followup",
        arguments: { followupId: "followup-1", dueAt: "2026-05-16T09:00:00.000Z", title: "Mover seguimiento post visita" },
        role: "related",
        relatedTo: "visit-1",
        humanSummary: "Mover seguimiento relacionado",
      },
    ]);
  });

  it("accepts richer planner action contracts and normalizes fields into arguments", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "mixed",
          summary: "Crear cotizacion y preparar seguimiento relacionado",
          actions: [
            {
              domain: "quotes",
              action: "create",
              kind: "write",
              fields: {
                customerId: "customer-1",
                items: [{ productId: "product-1", quantity: 2, unitPrice: 1500 }],
                pricing: { currency: "COP" },
                conditions: "Pago 50/50",
                status: "draft",
              },
              role: "primary",
              entityRef: "customer-1",
              humanSummary: "Crear cotizacion inicial",
              confidence: 0.94,
            },
            {
              domain: "followups",
              action: "create",
              kind: "write",
              fields: {
                customerId: "customer-1",
                title: "Confirmar envio de cotizacion",
                dueAt: "2026-05-16T12:00:00.000Z",
                type: "llamada",
              },
              role: "related",
              relatedTo: "quotes:create:0",
              humanSummary: "Crear seguimiento comercial",
              confidence: 0.89,
            },
          ],
          requiresConfirmation: true,
          missingFields: [],
          ambiguity: [],
          confidence: 0.92,
          responseStyle: "adaptive",
        }),
      }),
    );

    const plan = await planPlatformIntent(buildPlatformContext(makeState({
      messages: [new HumanMessage("Crea una cotizacion para Acme y agenda un seguimiento")],
    })));

    expect(plan.intent).toBe("mixed");
    expect(plan.confidence).toBe(0.92);
    expect(plan.responseStyle).toBe("adaptive");
    expect(plan.actions).toMatchObject([
      {
        domain: "quotes",
        action: "create",
        toolName: "create_quote",
        arguments: {
          customerId: "customer-1",
          items: [{ productId: "product-1", quantity: 2, unitPrice: 1500 }],
          pricing: { currency: "COP" },
          conditions: "Pago 50/50",
          status: "draft",
        },
        role: "primary",
        entityRef: "customer-1",
        humanSummary: "Crear cotizacion inicial",
      },
      {
        domain: "followups",
        action: "create",
        toolName: "create_followup",
        arguments: {
          customerId: "customer-1",
          title: "Confirmar envio de cotizacion",
          dueAt: "2026-05-16T12:00:00.000Z",
          type: "llamada",
        },
        role: "related",
        relatedTo: "quotes:create:0",
        humanSummary: "Crear seguimiento comercial",
      },
    ]);
  });

  it("merges fields and arguments without dropping fields, with arguments taking precedence", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "write",
          summary: "Actualizar visita con payload mixto",
          actions: [
            {
              domain: "visits",
              action: "update",
              kind: "write",
              fields: {
                visitId: "visit-1",
                scheduledAt: "2026-05-15T10:00:00.000Z",
                summary: "Visita original",
              },
              arguments: {
                summary: "Visita reprogramada",
                notes: "Mover por lluvia",
              },
              confidence: 0.9,
            },
          ],
          requiresConfirmation: true,
        }),
      }),
    );

    const plan = await planPlatformIntent(buildPlatformContext(makeState({
      messages: [new HumanMessage("Reprograma la visita y agrega una nota")],
    })));

    expect(plan.actions).toMatchObject([
      {
        domain: "visits",
        action: "update",
        toolName: "update_visit",
        arguments: {
          visitId: "visit-1",
          scheduledAt: "2026-05-15T10:00:00.000Z",
          summary: "Visita reprogramada",
          notes: "Mover por lluvia",
        },
      },
    ]);
  });

  it("parses ambiguity and missing info metadata for clarification-first planning", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "write",
          summary: "Actualizar visita sin referencia unica",
          actions: [
            {
              domain: "visits",
              action: "update",
              arguments: {
                scheduledAt: "2026-05-15T10:00:00.000Z",
              },
              confidence: 0.88,
            },
          ],
          requiresConfirmation: true,
          missingFields: ["visitId"],
          ambiguity: ["multiple_visits"],
          clarificationQuestion: "¿Cuál visita querés mover?",
        }),
      }),
    );

    const plan = await planPlatformIntent(buildPlatformContext(makeState({
      messages: [new HumanMessage("Move la visita del jueves")],
    })));

    expect(plan.intent).toBe("write");
    expect(plan.missingFields).toEqual(["visitId"]);
    expect(plan.ambiguity).toEqual(["multiple_visits"]);
    expect(plan.clarificationQuestion).toBe("¿Cuál visita querés mover?");
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
          proposal: {
            blocks: {},
            summary: {
              primaryCount: 1,
              relatedCount: 1,
              primaryActions: ["visits.update"],
              relatedActions: ["followups.update"],
              relatedToIds: ["visit-1"],
              labels: ["Mover visita", "Mover seguimiento"],
            },
          },
          proposalStatus: "draft",
          agendaItems: [{ id: "visit-2", type: "visit", label: "Visita Acme", scheduledAt: "2026-05-18T09:00:00.000Z" }],
          mentionedEntities: { quoteId: "quote-1", followupId: "followup-1" },
          messages: [new HumanMessage("mostrame cotizaciones")],
        }),
      ),
    );

    const [messages] = mockInvoke.mock.calls[0];
    expect(messages[0].content).toContain("Sos Laura, la asistente comercial del CRM de Norgtech");
    expect(messages[0].content).toContain("quotes.create");
    expect(messages[0].content).toContain("plan balanceado");
    expect(messages[0].content).toContain("missingFields");
    expect(messages[0].content).toContain("ambiguity");
    expect(messages[0].content).toContain("responseStyle");
    expect(messages[0].content).toContain("role");
    expect(messages[0].content).toContain("relatedTo");
    expect(messages[1].content).toContain("customer-1");
    expect(messages[1].content).toContain("activeProposalSummary");
    expect(messages[1].content).toContain("relatedEntities");
    expect(messages[1].content).toContain("visit-1");
    expect(messages[1].content).toContain("quote-1");
    expect(messages[1].content).toContain("followup-1");
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

  it("unsupported planner action remains unsupported and is rejected by validator", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "unsupported",
          summary: "Eliminar pedidos en lote",
          actions: [
            {
              domain: "orders",
              action: "bulk_delete",
              arguments: { olderThan: "2025-01-01" },
              confidence: 0.88,
            },
          ],
          requiresConfirmation: false,
        }),
      }),
    );

    const plan = await planPlatformIntent(buildPlatformContext(makeState()));
    const result = validatePlatformPlan(plan);

    expect(plan.actions[0]).toMatchObject({
      domain: "orders",
      action: "bulk_delete",
      toolName: "",
      requiredFields: [],
      missingFields: [],
      requiresConfirmation: true,
    });
    expect(plan.actions[0].toolName).not.toBe("orders_bulk_delete");
    expect(result.ok).toBe(false);
    expect(result.executableReads).toEqual([]);
    expect(result.proposalWrites).toEqual([]);
    expect(result.errors.join(" ")).toContain("no está disponible");
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

  it("commercial create clarification mentions only the actually missing subset", () => {
    const result = validatePlatformPlan({
      intent: "write",
      summary: "Crear cotizacion parcial",
      actions: [
        {
          domain: "quotes",
          action: "create",
          toolName: "create_quote",
          arguments: {
            customerId: "customer-1",
            items: [{ productId: "product-1", quantity: 2, unitPrice: 1500 }],
            pricing: { currency: "COP" },
          },
          requiredFields: ["customerId", "items", "pricing", "conditions", "status"],
          missingFields: [],
          requiresConfirmation: true,
        },
      ],
      requiresConfirmation: true,
    });

    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual(["conditions", "status"]);
    expect(result.clarificationQuestion).toContain("condiciones");
    expect(result.clarificationQuestion).toContain("estado");
    expect(result.clarificationQuestion).not.toContain("cliente");
    expect(result.clarificationQuestion).not.toContain("items");
    expect(result.clarificationQuestion).not.toContain("precios");
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
    expect(result.clarificationQuestion).toContain("cliente");
    expect(result.clarificationQuestion).toContain("fecha y hora");
    expect(result.clarificationQuestion).toContain("tipo de seguimiento");
  });

  it("clarification includes missing fields accumulated across multiple actions", () => {
    const result = validatePlatformPlan({
      intent: "write",
      summary: "Crear seguimiento y contacto",
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
        {
          domain: "contacts",
          action: "create",
          toolName: "create_contact",
          arguments: { customerId: "customer-1" },
          requiredFields: ["customerId", "fullName"],
          missingFields: [],
          requiresConfirmation: true,
        },
      ],
      requiresConfirmation: true,
    });

    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual(["customerId", "dueAt", "type", "fullName"]);
    expect(result.clarificationQuestion).toContain("cliente");
    expect(result.clarificationQuestion).toContain("fecha y hora");
    expect(result.clarificationQuestion).toContain("tipo de seguimiento");
    expect(result.clarificationQuestion).toContain("nombre del contacto");
  });

  it("platformNode stops for ambiguity before proposal creation", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "write",
          summary: "Actualizar visita ambigua",
          actions: [
            {
              domain: "visits",
              action: "update",
              arguments: {
                scheduledAt: "2026-05-18T11:00:00.000Z",
              },
              confidence: 0.9,
            },
          ],
          requiresConfirmation: true,
          ambiguity: ["multiple_visits"],
          clarificationQuestion: "¿Cuál visita querés mover?",
        }),
      }),
    );

    const result = await platformNode(makeState({
      messages: [new HumanMessage("Pasame la visita del jueves para la semana que viene")],
    }));

    expect(result.mode).toBe("clarification");
    expect(result.proposal).toBeUndefined();
    expect(result.messages?.[0].content).toContain("¿Cuál visita querés mover?");
  });

  it("platformNode uses validator-style humanized clarification for planner missing fields", async () => {
    mockInvoke.mockResolvedValueOnce(
      new AIMessage({
        content: JSON.stringify({
          intent: "write",
          summary: "Crear seguimiento con datos faltantes",
          actions: [
            {
              domain: "followups",
              action: "create",
              kind: "write",
              fields: {
                title: "Llamar a Acme",
              },
              confidence: 0.87,
            },
          ],
          requiresConfirmation: true,
          missingFields: ["customerId", "dueAt", "type"],
          ambiguity: [],
        }),
      }),
    );

    const result = await platformNode(makeState({
      messages: [new HumanMessage("Crea un seguimiento para Acme")],
    }));

    expect(result.mode).toBe("clarification");
    expect(result.proposal).toBeUndefined();
    expect(result.messages?.[0].content).toContain("cliente");
    expect(result.messages?.[0].content).toContain("fecha y hora");
    expect(result.messages?.[0].content).toContain("tipo de seguimiento");
  });
});
