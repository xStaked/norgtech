import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LauraState } from "../graph/state.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const {
  mockSearchCustomers,
  mockSearchOpportunities,
  mockGetCustomerDetails,
  mockGetOpportunityDetails,
  mockGetPendingTasks,
  mockGetScheduledVisits,
  mockSearchProducts,
  mockGetProductDetails,
  mockSearchQuotes,
  mockGetQuoteDetails,
  mockSearchOrders,
  mockGetOrderDetails,
  mockSearchSegments,
  mockSearchContacts,
  mockSearchVisits,
  mockSearchFollowups,
  mockGetDashboardSummary,
  mockCreateInteraction,
  mockUpsertOpportunity,
  mockCreateFollowUp,
  mockCreateTask,
  mockCreateVisit,
  mockCreateLlm,
} = vi.hoisted(() => ({
  mockSearchCustomers: vi.fn().mockResolvedValue([
    { id: "customer-1", label: "Acme Piscicola" },
    { id: "customer-2", label: "Acme Trading" },
  ]),
  mockSearchOpportunities: vi.fn().mockResolvedValue([
    { id: "opp-1", label: "Sistema de inventario" },
  ]),
  mockGetCustomerDetails: vi.fn().mockResolvedValue({ id: "customer-1", displayName: "Acme Piscicola" }),
  mockGetOpportunityDetails: vi.fn().mockResolvedValue({ id: "opp-1", title: "Sistema de inventario" }),
  mockGetPendingTasks: vi.fn().mockResolvedValue([
    { id: "task-1", title: "Llamar a cliente", dueAt: "2026-05-10T10:00:00.000Z", type: "llamada" },
  ]),
  mockGetScheduledVisits: vi.fn().mockResolvedValue([
    { id: "visit-1", summary: "Visita técnica", scheduledAt: "2026-05-11T15:00:00.000Z" },
  ]),
  mockSearchProducts: vi.fn().mockResolvedValue([{ id: "product-1", name: "Sensor IoT" }]),
  mockGetProductDetails: vi.fn().mockResolvedValue({ id: "product-1", name: "Sensor IoT" }),
  mockSearchQuotes: vi.fn().mockResolvedValue([{ id: "quote-1", status: "draft" }]),
  mockGetQuoteDetails: vi.fn().mockResolvedValue({ id: "quote-1", status: "draft" }),
  mockSearchOrders: vi.fn().mockResolvedValue([{ id: "order-1", status: "open" }]),
  mockGetOrderDetails: vi.fn().mockResolvedValue({ id: "order-1", status: "open" }),
  mockSearchSegments: vi.fn().mockResolvedValue([{ id: "segment-1", name: "Agro" }]),
  mockSearchContacts: vi.fn().mockResolvedValue([{ id: "contact-1", fullName: "Carlos Mendoza" }]),
  mockSearchVisits: vi.fn().mockResolvedValue([{ id: "visit-1", summary: "Visita técnica" }]),
  mockSearchFollowups: vi.fn().mockResolvedValue([{ id: "followup-1", title: "Llamar a cliente" }]),
  mockGetDashboardSummary: vi.fn().mockResolvedValue({ customers: 2, opportunities: 1 }),
  mockCreateInteraction: vi.fn().mockResolvedValue({ id: "interaction-1" }),
  mockUpsertOpportunity: vi.fn().mockResolvedValue({ id: "opp-created-1" }),
  mockCreateFollowUp: vi.fn().mockResolvedValue({ id: "followup-1" }),
  mockCreateTask: vi.fn().mockResolvedValue({ id: "task-created-1" }),
  mockCreateVisit: vi.fn().mockResolvedValue({ id: "visit-created-1" }),
  mockCreateLlm: vi.fn().mockReturnValue({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        intent: "report",
        interactionSummary: "Reunión con Acme sobre sistema de inventario",
        suggestedOpportunityTitle: "Sistema de inventario - Acme",
        suggestedOpportunityStage: "visita",
        suggestedNextStep: "Programar demo",
        taskType: "llamada",
        signals: { objections: ["precio"], risk: "medio", buyingIntent: "alto" },
      }),
    }),
  }),
}));

vi.mock("../config/index.js", () => ({
  config: {
    port: 3100,
    nestjsBaseUrl: "http://localhost:3001",
    nestjsServiceToken: "test-token",
    databaseUrl: "",
    llm: { provider: "deepseek", model: "deepseek-chat", timeoutMs: 30000 },
  },
}));

vi.mock("../tools/nestjs-client.js", () => ({
  searchCustomers: mockSearchCustomers,
  searchOpportunities: mockSearchOpportunities,
  getCustomerDetails: mockGetCustomerDetails,
  getOpportunityDetails: mockGetOpportunityDetails,
  getPendingTasks: mockGetPendingTasks,
  getScheduledVisits: mockGetScheduledVisits,
  searchProducts: mockSearchProducts,
  getProductDetails: mockGetProductDetails,
  searchQuotes: mockSearchQuotes,
  getQuoteDetails: mockGetQuoteDetails,
  searchOrders: mockSearchOrders,
  getOrderDetails: mockGetOrderDetails,
  searchSegments: mockSearchSegments,
  searchContacts: mockSearchContacts,
  searchVisits: mockSearchVisits,
  searchFollowups: mockSearchFollowups,
  getDashboardSummary: mockGetDashboardSummary,
  createInteraction: mockCreateInteraction,
  upsertOpportunity: mockUpsertOpportunity,
  createFollowUp: mockCreateFollowUp,
  createTask: mockCreateTask,
  createVisit: mockCreateVisit,
}));

vi.mock("../config/providers.js", () => ({
  createLlm: mockCreateLlm,
}));

import { routerNode } from "../graph/nodes/router.js";
import { greetingNode } from "../graph/nodes/greeting.js";
import { discardNode } from "../graph/nodes/discard.js";
import { buildProposalNode } from "../graph/nodes/build-proposal.js";
import { agendaNode } from "../graph/nodes/agenda.js";
import { clarifyNode } from "../graph/nodes/clarify.js";
import { confirmNode } from "../graph/nodes/confirm.js";
import { refineNode } from "../graph/nodes/refine.js";
import { extractIntentNode } from "../graph/nodes/extract-intent.js";
import { platformNode } from "../graph/nodes/platform.js";
import { routerEdge } from "../graph/edges.js";
import { createLauraGraph } from "../graph/graph.js";

function makeState(overrides: Partial<LauraState> = {}): LauraState {
  return {
    sessionId: "test-session",
    userId: "test-user",
    messages: [new HumanMessage("test")],
    mode: "greeting",
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

function makeProposal(): import("../types.js").ProposalPayload {
  return {
    blocks: {
      interaction: { enabled: true, summary: "Reunión con Acme", rawMessage: "Estuve con Acme" },
      opportunity: { enabled: true, createNew: true, title: "Sistema de inventario - Acme", stage: "visita" },
      followUp: { enabled: true, title: "Programar demo", dueAt: "2026-05-15T10:00:00.000Z", type: "llamada" },
      task: { enabled: true, title: "Registrar seguimiento", dueAt: "2026-05-12T10:00:00.000Z" },
      signals: { enabled: true, objections: ["precio"], riskFlags: ["medio"], buyingSignals: ["alto"] },
    },
  };
}

// ============================================================
// SECTION 1: ROUTER — Tipos de usuarios y variaciones de español
// ============================================================

describe("Router — Tipos de usuarios", () => {
  describe("Vendedor experimentado — lenguaje directo y profesional", () => {
    it("clasifica reporte con 'cotización' como platform", async () => {
      const state = makeState({ messages: [new HumanMessage("Visité a Acme Piscicola, reunión con el gerente Carlos. Solicitaron cotización para sistema de inventario.")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("clasifica reporte con 'semana pasada' como platform sin falso positivo de agenda", async () => {
      const state = makeState({ messages: [new HumanMessage("Llamé a Distribuidores del Norte para dar seguimiento a la propuesta enviada la semana pasada.")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("clasifica reporte con 'hoy' y 'Avanzada' como platform", async () => {
      const state = makeState({ messages: [new HumanMessage("Cerré la venta con Tecnología Avanzada SA, firmaron el contrato hoy.")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("envía consulta de agenda directa a platform", async () => {
      const state = makeState({ messages: [new HumanMessage("agenda")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("envía pedido de tareas pendientes a platform", async () => {
      const state = makeState({ messages: [new HumanMessage("pendientes")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });
  });

  describe("Vendedor nuevo — lenguaje informal e inseguro", () => {
    it("envía saludo casual a platform", async () => {
      const state = makeState({ messages: [new HumanMessage("hola!")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("envía 'hey' a platform", async () => {
      const state = makeState({ messages: [new HumanMessage("hey")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("envía pregunta informal sobre agenda a platform", async () => {
      const state = makeState({ messages: [new HumanMessage("que tengo que hacer hoy?")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("clasifica reporte vago con 'cliente' como platform", async () => {
      const state = makeState({ messages: [new HumanMessage("fui a ver un cliente y me dijo que le interesa")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });
  });

  describe("Gerente — consultas estratégicas", () => {
    it("envía consulta de visitas programadas a platform", async () => {
      const state = makeState({ messages: [new HumanMessage("Qué visitas tenemos programadas esta semana?")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("clasifica consulta de tareas del equipo como platform", async () => {
      const state = makeState({ messages: [new HumanMessage("Cuáles son las tareas pendientes del equipo?")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });
  });

  describe("Usuario con typing errors / typos", () => {
    it("clasifica 'ola' como platform por default (no greeting)", async () => {
      const state = makeState({ messages: [new HumanMessage("ola")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("clasifica 'hla' como platform por default (typo de hola)", async () => {
      const state = makeState({ messages: [new HumanMessage("hla")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("clasifica 'bns dias' como platform por default (typo de buenos días)", async () => {
      const state = makeState({ messages: [new HumanMessage("bns dias")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("clasifica 'agnda' como platform por default (typo de agenda)", async () => {
      const state = makeState({ messages: [new HumanMessage("agnda")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });
  });

  describe("Usuario con lenguaje regional argentino", () => {
    it("LIMITACIÓN: 'buenas' no se detecta como greeting (cae a platform)", async () => {
      const state = makeState({ messages: [new HumanMessage("buenas")] });
      const result = await routerNode(state);
      expect(result.mode).toBe("platform");
    });

    it("envía 'che, necesito ver mi agenda' a platform", async () => {
      const state = makeState({ messages: [new HumanMessage("che, necesito ver mi agenda")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("clasifica 'dale' como platform sin aclaración activa", async () => {
      const state = makeState({ messages: [new HumanMessage("dale")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });
  });

  describe("Usuario con Spanglish / mixto", () => {
    it("clasifica mensaje con inglés + español como platform", async () => {
      const state = makeState({ messages: [new HumanMessage("Tuve un meeting con el cliente, quieren un follow-up del producto")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });

    it("envía 'hi, necesito ver mi agenda' a platform", async () => {
      const state = makeState({ messages: [new HumanMessage("hi, necesito ver mi agenda")] });
      expect((await routerNode(state)).mode).toBe("platform");
    });
  });
});

// ============================================================
// SECTION 2: Router — Normalización de acentos y puntuación
// ============================================================

describe("Router — Normalización de texto", () => {
  it("envía con acentos: 'qué tengo pendiente?' a platform", async () => {
    const state = makeState({ messages: [new HumanMessage("¿Qué tengo pendiente?")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("envía sin acentos: 'que tengo pendiente' a platform", async () => {
    const state = makeState({ messages: [new HumanMessage("que tengo pendiente")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("envía 'buenos días!' con signo de exclamación a platform", async () => {
    const state = makeState({ messages: [new HumanMessage("buenos días!")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("envía 'buenos días???' con múltiples signos a platform", async () => {
    const state = makeState({ messages: [new HumanMessage("buenos días???")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("envía 'hola.' con punto a platform", async () => {
    const state = makeState({ messages: [new HumanMessage("hola.")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("envía con MAYÚSCULAS: 'BUENOS DÍAS' a platform", async () => {
    const state = makeState({ messages: [new HumanMessage("BUENOS DÍAS")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("envía 'QUÉ TENGO HOY' en mayúsculas a platform", async () => {
    const state = makeState({ messages: [new HumanMessage("QUÉ TENGO HOY?")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });
});

// ============================================================
// SECTION 3: Router — Ciclo de vida de propuestas
// ============================================================

describe("Router — Ciclo de vida de propuestas", () => {
  const proposalState = {
    proposalStatus: "draft" as const,
    proposal: makeProposal(),
  };

  describe("Confirmación — distintas formas de confirmar", () => {
    const confirmCases = [
      "confirmo",
      "confirmo la propuesta",
      "sí confirmo",
      "si, confirmo",
      "guardalo",
      "guardá",
      "dale guardalo",
      "ok guardalo",
    ];

    for (const input of confirmCases) {
      it(`clasifica "${input}" como confirm con propuesta activa`, async () => {
        const state = makeState({
          messages: [new HumanMessage(input)],
          ...proposalState,
        });
        expect((await routerNode(state)).mode).toBe("confirm");
      });
    }

    it("NO clasifica 'confirmo' como confirm sin propuesta activa", async () => {
      const state = makeState({
        messages: [new HumanMessage("confirmo")],
        proposalStatus: "draft",
        proposal: null,
      });
      expect((await routerNode(state)).mode).not.toBe("confirm");
    });

    it("NO clasifica 'confirmo' como confirm con proposalStatus != 'draft'", async () => {
      const state = makeState({
        messages: [new HumanMessage("confirmo la propuesta")],
        proposalStatus: "confirmed",
        proposal: makeProposal(),
      });
      expect((await routerNode(state)).mode).not.toBe("confirm");
    });
  });

  describe("Descarte — distintas formas de descartar", () => {
const discardCases = [
      "cancelar",
      "cancelar la propuesta",
      "cancela",
      "descartar",
      "descarta",
      "no lo guardes",
      "borrar",
      "borra",
      "eliminar",
      "elimina",
    ];

    for (const input of discardCases) {
      it(`clasifica "${input}" como discard con propuesta activa`, async () => {
        const state = makeState({
          messages: [new HumanMessage(input)],
          ...proposalState,
        });
        expect((await routerNode(state)).mode).toBe("discard");
      });
    }

    it("NO clasifica 'cancelar' como discard sin propuesta activa", async () => {
      const state = makeState({
        messages: [new HumanMessage("cancelar")],
        proposalStatus: "draft",
        proposal: null,
      });
      expect((await routerNode(state)).mode).not.toBe("discard");
    });

    it("'no guardar' descarta antes de evaluar confirmación", async () => {
      const state = makeState({
        messages: [new HumanMessage("no guardar")],
        ...proposalState,
      });
      expect((await routerNode(state)).mode).toBe("discard");
    });
  });

  describe("Refinamiento — distintas formas de pedir cambios", () => {
    const refineCases = [
      "cambia el título",
      "modifica la fecha",
      "ajusta el monto",
      "editar",
      "no quiero eso",
      "agrega más opciones",
      "añadele este correo aquavet@gmail.com y este numero 32945819033",
      "mira el correo aquavet@sbi.com y telefono 3728393827839",
      "mejor poné otra cosa",
      "en vez de eso, poné el monto correcto",
      "ya te pase los datos",
    ];

    for (const input of refineCases) {
      it(`clasifica "${input}" como refine con propuesta activa`, async () => {
        const state = makeState({
          messages: [new HumanMessage(input)],
          ...proposalState,
        });
        expect((await routerNode(state)).mode).toBe("refine");
      });
    }

    it("NO clasifica 'cambia' como refine sin propuesta activa", async () => {
      const state = makeState({
        messages: [new HumanMessage("cambia algo")],
        proposalStatus: "draft",
        proposal: null,
      });
      expect((await routerNode(state)).mode).not.toBe("refine");
    });
  });
});

// ============================================================
// SECTION 4: Router — Edge cases
// ============================================================

describe("Router — Edge cases", () => {
  it("clasifica mensaje vacío como platform por default", async () => {
    const state = makeState({ messages: [new HumanMessage("")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("clasifica mensaje de solo espacios como platform por default", async () => {
    const state = makeState({ messages: [new HumanMessage("   ")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("clasifica mensaje con solo emoji como platform", async () => {
    const state = makeState({ messages: [new HumanMessage("👍")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("clasifica mensaje muy largo con 'cliente' como platform", async () => {
    const longMsg = "Estuve con el cliente y ".repeat(50) + "quieren una propuesta";
    const state = makeState({ messages: [new HumanMessage(longMsg)] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("clasifica 'hola, estuve con el cliente' como platform", async () => {
    const state = makeState({ messages: [new HumanMessage("hola, estuve con el cliente ayer y quieren un sistema")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("clasifica mensaje con caracteres especiales como platform por default", async () => {
    const state = makeState({ messages: [new HumanMessage("@#$%^&*()")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("clasifica números solos como platform sin aclaración activa", async () => {
    const state = makeState({ messages: [new HumanMessage("123")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("clasifica '1' como platform sin aclaración activa", async () => {
    const state = makeState({ messages: [new HumanMessage("1")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("clasifica selección como clarification con aclaración activa", async () => {
    const state = makeState({
      messages: [new HumanMessage("opcion 1")],
      clarificationOptions: {
        type: "customer",
        options: [{ id: "customer-1", label: "Acme Piscicola" }],
      },
    });
    expect((await routerNode(state)).mode).toBe("clarification");
  });

  it("clasifica 'ok' como platform sin aclaración ni propuesta activa", async () => {
    const state = makeState({ messages: [new HumanMessage("ok")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("palabras con acentos y ñ se normalizan correctamente", async () => {
    const state = makeState({ messages: [new HumanMessage("visitas")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("mensaje con HTML/SQL injection attempt → platform por default", async () => {
    const state = makeState({ messages: [new HumanMessage("<script>alert('xss')</script>")] });
    expect((await routerNode(state)).mode).toBe("platform");
  });
});

// ============================================================
// SECTION 5: Router — Confirm/Discard/Refine SIN propuesta activa
// ============================================================

describe("Router — Comportamiento sin propuesta activa", () => {
  it("'confirmo' sin propuesta ni aclaración activa → platform", async () => {
    const state = makeState({
      messages: [new HumanMessage("confirmo")],
      proposal: null,
      proposalStatus: "draft",
    });
    expect((await routerNode(state)).mode).toBe("platform");
  });

  it("'cancelar' sin propuesta → platform", async () => {
    const state = makeState({
      messages: [new HumanMessage("cancelar")],
      proposal: null,
      proposalStatus: "draft",
    });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("'cambia' sin propuesta → platform", async () => {
    const state = makeState({
      messages: [new HumanMessage("cambia algo")],
      proposal: null,
      proposalStatus: "draft",
    });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("'descartar' sin propuesta → no descarta", async () => {
    const state = makeState({
      messages: [new HumanMessage("descartar")],
      proposal: null,
      proposalStatus: "draft",
    });
    const result = await routerNode(state);
    expect(result.mode).not.toBe("discard");
  });
});

// ============================================================
// SECTION 5b: Router — Platform routing for read/write CRM requests
// ============================================================

describe("Router — Platform routing for CRM reads", () => {
  it("should classify product queries as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("que productos tenemos?")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify quote queries as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("cuantas cotizaciones abiertas hay?")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify show/list queries as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("mostra los clientes del segmento agro")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify customer search as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("buscar clientes de cordoba")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify opportunity status as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("cual es el estado de la oportunidad?")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify contact info as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("datos del contacto Carlos Mendoza")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify catalog/dashboard queries as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("mostra el catalogo de productos")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify list customer requests as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("listame clientes")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });
});

describe("Router — Platform routing for CRM writes", () => {
  it("should classify time changes as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("cambia la hora de la tarea a las 14:20")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify status updates on opportunities as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("actualiza el estado de la oportunidad a negociacion")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify visit cancellation as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("cancela la visita de mañana")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify followup rescheduling as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("reprograma el seguimiento para el lunes")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify quote date changes as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("actualiza la fecha de la cotizacion al viernes")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify complete/close actions as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("completa la tarea de llamar a Acme")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify stage advancement as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("avanza la oportunidad a cotizacion")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });
});

describe("Router — Existing proposal and planner entry behavior", () => {
  it("should route greetings to 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("hola laura")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should route agenda queries to 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("que tengo pendiente hoy?")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });

  it("should classify reports about clients as 'platform'", async () => {
    const state = makeState({ messages: [new HumanMessage("estuve con un cliente y cerramos un trato")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("platform");
  });
});

// ============================================================
// SECTION 6: Graph flow — edge routing
// ============================================================

describe("Router Edge — flujo del grafo", () => {
  it("routes 'greeting' mode → 'greeting' node", () => {
    expect(routerEdge(makeState({ mode: "greeting" }))).toBe("greeting");
  });

  it("routes 'agenda' mode → 'agenda' node", () => {
    expect(routerEdge(makeState({ mode: "agenda" }))).toBe("agenda");
  });

  it("routes 'clarification' mode → 'clarify' node", () => {
    expect(routerEdge(makeState({ mode: "clarification" }))).toBe("clarify");
  });

  it("routes 'proposal' mode → 'extract_intent' node", () => {
    expect(routerEdge(makeState({ mode: "proposal" }))).toBe("extract_intent");
  });

  it("routes 'confirm' mode → 'confirm' node", () => {
    expect(routerEdge(makeState({ mode: "confirm" }))).toBe("confirm");
  });

  it("routes 'discard' mode → 'discard' node", () => {
    expect(routerEdge(makeState({ mode: "discard" }))).toBe("discard");
  });

  it("routes 'refine' mode → 'refine' node", () => {
    expect(routerEdge(makeState({ mode: "refine" }))).toBe("refine");
  });

  it("routes 'query' mode → 'query' node", () => {
    expect(routerEdge(makeState({ mode: "query" }))).toBe("query");
  });

  it("routes 'modify' mode → 'modify' node", () => {
    expect(routerEdge(makeState({ mode: "modify" }))).toBe("modify");
  });

  it("routes 'qa' mode → 'qa' node", () => {
    expect(routerEdge(makeState({ mode: "qa" }))).toBe("qa");
  });

  it("routes 'platform' mode → 'platform' node", () => {
    expect(routerEdge(makeState({ mode: "platform" }))).toBe("platform");
  });
});

// ============================================================
// SECTION 7: Confirm node — persistencia de propuestas
// ============================================================

describe("Confirm node — guardado en NestJS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertOpportunity.mockResolvedValue({ id: "opp-new-1" });
    mockCreateInteraction.mockResolvedValue({ id: "int-new-1" });
    mockCreateFollowUp.mockResolvedValue({ id: "fu-new-1" });
    mockCreateTask.mockResolvedValue({ id: "task-new-1" });
  });

  it("guarda opportunity, interaction, followUp y task con customerId", async () => {
    const state = makeState({
      messages: [new HumanMessage("confirmo")],
      mode: "confirm",
      customerContext: { id: "cust-1", label: "Acme" },
      proposal: makeProposal(),
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await confirmNode(state);

    expect(result.proposalStatus).toBe("confirmed");
    expect(mockUpsertOpportunity).toHaveBeenCalledTimes(1);
    expect(mockCreateInteraction).toHaveBeenCalledTimes(1);
    expect(mockCreateFollowUp).toHaveBeenCalledTimes(1);
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
  });

  it("sin proposal → error y mensaje", async () => {
    const state = makeState({
      messages: [new HumanMessage("confirmo")],
      mode: "confirm",
      proposal: null,
    });

    const result = await confirmNode(state);
    expect(result.lastError).toBe("No hay propuesta para confirmar");
    expect((result.messages![result.messages!.length - 1] as AIMessage).content).toContain("No hay propuesta");
  });

  it("sin customerId → opportunity no se guarda (enabled pero sin persistInfo)", async () => {
    const state = makeState({
      messages: [new HumanMessage("confirmo")],
      mode: "confirm",
      customerContext: null,
      proposal: makeProposal(),
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await confirmNode(state);
    expect(result.proposalStatus).toBe("confirmed");
    expect(mockUpsertOpportunity).not.toHaveBeenCalled();
    expect(mockCreateInteraction).not.toHaveBeenCalled();
    expect(mockCreateFollowUp).not.toHaveBeenCalled();
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it("guarda solo bloques habilitados", async () => {
    const partialProposal: import("../types.js").ProposalPayload = {
      blocks: {
        interaction: { enabled: true, summary: "Reunión", rawMessage: "Reunión con cliente" },
        opportunity: { enabled: false, title: "", stage: "", createNew: false },
        followUp: { enabled: false, title: "", dueAt: "", type: "" },
        signals: { enabled: false, objections: [], riskFlags: [], buyingSignals: [] },
      },
    };
    const state = makeState({
      messages: [new HumanMessage("confirmo")],
      mode: "confirm",
      customerContext: { id: "cust-1", label: "Acme" },
      proposal: partialProposal,
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    await confirmNode(state);

    expect(mockCreateInteraction).toHaveBeenCalledTimes(1);
    expect(mockUpsertOpportunity).not.toHaveBeenCalled();
    expect(mockCreateFollowUp).not.toHaveBeenCalled();
  });
});

// ============================================================
// SECTION 8: Discard node
// ============================================================

describe("Discard node — descarte de propuestas", () => {
  it("limpia la propuesta y marca como discarded", async () => {
    const state = makeState({
      messages: [new HumanMessage("cancelar")],
      proposal: makeProposal(),
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await discardNode(state);
    expect(result.proposal).toBeNull();
    expect(result.proposalId).toBeNull();
    expect(result.proposalStatus).toBe("discarded");
  });

  it("mantiene los mensajes existentes y agrega respuesta", async () => {
    const state = makeState({
      messages: [new HumanMessage("hola"), new AIMessage("¡Hola!"), new HumanMessage("cancelar")],
      proposal: makeProposal(),
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await discardNode(state);
    expect(result.messages!.length).toBe(4);
    const lastMsg = result.messages![3] as AIMessage;
    expect((lastMsg.content as string).toLowerCase()).toContain("descart");
  });
});

// ============================================================
// SECTION 9: Refine node (mocked LLM)
// ============================================================

describe("Refine node — refinamiento de propuestas", () => {
  it("sin propuesta activa → error", async () => {
    const state = makeState({
      messages: [new HumanMessage("cambia el título")],
      proposal: null,
    });

    const result = await refineNode(state);
    expect(result.lastError).toBe("No hay propuesta activa para refinar");
    expect(result.mode).toBe("proposal");
  });

  it("con propuesta activa → LLM recibe feedback y devuelve propuesta refinada", async () => {
    mockCreateLlm.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          blocks: {
            interaction: { enabled: true, summary: "Reunión actualizada", rawMessage: "Estuve con Acme" },
            opportunity: { enabled: true, createNew: true, title: "Sistema nuevo - Acme", stage: "negociacion" },
          },
        }),
      }),
    });

    const state = makeState({
      messages: [new HumanMessage("cambia el título a algo más corto")],
      proposal: makeProposal(),
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await refineNode(state);
    expect(result.proposal).toBeDefined();
    expect(result.proposalStatus).toBe("draft");
    expect(result.messages!.length).toBeGreaterThan(state.messages.length);
  });

  it("si LLM devuelve JSON inválido → mantiene propuesta y mensaje de error", async () => {
    mockCreateLlm.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        content: "esto no es JSON válido",
      }),
    });

    const state = makeState({
      messages: [new HumanMessage("modifica algo")],
      proposal: makeProposal(),
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await refineNode(state);
    expect(result.proposal).toEqual(state.proposal);
    expect(result.proposalStatus).toBe("draft");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect((lastMsg.content as string).toLowerCase()).toContain("no pude");
  });

  it("aplica cambios cuando LLM devuelve bloque directo sin wrapper blocks", async () => {
    mockCreateLlm.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          customer: {
            phone: "3023444442",
          },
        }),
      }),
    });

    const state = makeState({
      messages: [new HumanMessage("agregale este telefono: 3023444442")],
      proposal: {
        blocks: {
          customer: {
            legalName: "aquavet",
            displayName: "aquavet",
            phone: "",
            email: "aquavet@sbi.com",
            enabled: true,
            action: "create",
          },
        },
      },
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await refineNode(state);
    const customerBlock = result.proposal?.blocks.customer;
    expect(customerBlock).toBeDefined();
    expect(customerBlock?.phone).toBe("3023444442");
    expect(customerBlock?.legalName).toBe("aquavet");
  });

  it("aplica correo y telefono mencionados directamente al cliente activo sin crear contacto", async () => {
    const state = makeState({
      messages: [new HumanMessage("añadele este correo aquavet@gmail.com y este numero 32945819033")],
      proposal: {
        blocks: {
          customer: {
            legalName: "aquavet",
            displayName: "aquavet",
            enabled: true,
            action: "create",
          },
        },
      },
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await refineNode(state);

    expect(result.proposal?.blocks.customer).toMatchObject({
      legalName: "aquavet",
      displayName: "aquavet",
      email: "aquavet@gmail.com",
      phone: "32945819033",
    });
    expect(result.proposal?.blocks.contact).toBeUndefined();
  });

  it("aplica nombre, correo y telefono al cliente activo cuando el usuario pasa todos los datos juntos", async () => {
    const state = makeState({
      messages: [new HumanMessage("se llama aquavet, el correo es aquavet@sbi.com y el numero es 39205938574")],
      proposal: {
        blocks: {
          customer: {
            legalName: "",
            displayName: "",
            enabled: true,
            action: "create",
          },
        },
      },
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await refineNode(state);

    expect(result.proposal?.blocks.customer).toMatchObject({
      legalName: "aquavet",
      displayName: "aquavet",
      email: "aquavet@sbi.com",
      phone: "39205938574",
    });
  });

  it("si el usuario solo recuerda que ya pasó los datos, mantiene la propuesta y lo confirma sin regenerarla", async () => {
    const state = makeState({
      messages: [new HumanMessage("ya te pase los datos")],
      proposal: {
        blocks: {
          customer: {
            legalName: "aquavet",
            displayName: "aquavet",
            email: "aquavet@sbi.com",
            phone: "39205938574",
            enabled: true,
            action: "create",
          },
        },
      },
      proposalId: "prop-1",
      proposalStatus: "draft",
    });

    const result = await refineNode(state);

    expect(result.proposal).toEqual(state.proposal);
    expect(result.proposalStatus).toBe("draft");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect((lastMsg.content as string).toLowerCase()).toContain("ya tom");
  });
});

// ============================================================
// SECTION 10: Extract intent node (mocked LLM)
// ============================================================

describe("Extract intent node — extracción con LLM", () => {
  it("extrae intent de reporte del LLM", async () => {
    mockCreateLlm.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          intent: "report",
          customerName: "Acme Piscicola",
          interactionSummary: "Reunión con Acme sobre sistema de inventario",
          suggestedOpportunityTitle: "Sistema de inventario - Acme",
          suggestedOpportunityStage: "visita",
        }),
      }),
    });

    const state = makeState({
      messages: [new HumanMessage("Estuve con Acme, quieren el sistema de inventario")],
      customerContext: { id: "cust-1", label: "Acme Piscicola" },
    });

    const result = await extractIntentNode(state);
    expect(result.mode).toBe("proposal");
    expect(result._extractionResult).toBeDefined();
    expect((result._extractionResult as Record<string, unknown>).intent).toBe("report");
  });

  it("redirige a agenda si LLM retorna agenda_query", async () => {
    mockCreateLlm.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({ intent: "agenda_query" }),
      }),
    });

    const state = makeState({
      messages: [new HumanMessage("qué tengo pendiente hoy?")],
    });

    const result = await extractIntentNode(state);
    expect(result.mode).toBe("agenda");
  });

  it("maneja JSON inválido del LLM con fallback", async () => {
    mockCreateLlm.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        content: "No puedo generar un JSON con eso",
      }),
    });

    const state = makeState({
      messages: [new HumanMessage("algo raro")],
    });

    const result = await extractIntentNode(state);
    expect(result.mode).toBe("proposal");
    expect(result._extractionResult).toBeDefined();
    expect((result._extractionResult as Record<string, unknown>).interactionSummary).toBe("algo raro");
  });
});

// ============================================================
// SECTION 11: Clarify node — desambiguación
// ============================================================

describe("Clarify node — desambiguación de clientes", () => {
  beforeEach(() => {
    mockSearchCustomers.mockResolvedValue([
      { id: "customer-1", label: "Acme Piscicola" },
      { id: "customer-2", label: "Acme Trading" },
    ]);
  });

  it("múltiples resultados → muestra opciones de clarificación", async () => {
    const state = makeState({
      messages: [new HumanMessage("Acme")],
    });
    const result = await clarifyNode(state);
    expect(result.clarificationOptions).toBeDefined();
    expect(result.clarificationOptions!.type).toBe("customer");
    expect(result.clarificationOptions!.options).toHaveLength(2);
    expect(result.mode).toBe("clarification");
  });

  it("un solo resultado → auto-selecciona y va a proposal", async () => {
    mockSearchCustomers.mockResolvedValueOnce([
      { id: "customer-1", label: "Acme Piscicola" },
    ]);
    const state = makeState({ messages: [new HumanMessage("Acme Piscicola")] });
    const result = await clarifyNode(state);
    expect(result.customerContext).toEqual({ id: "customer-1", label: "Acme Piscicola" });
    expect(result.mode).toBe("proposal");
    expect(result.clarificationOptions).toBeNull();
  });

  it("sin resultados → mensaje de error y redirige a proposal", async () => {
    mockSearchCustomers.mockResolvedValueOnce([]);
    const state = makeState({ messages: [new HumanMessage("XYZNONEXISTENT")] });
    const result = await clarifyNode(state);
    expect(result.mode).toBe("proposal");
    expect(result.clarificationOptions).toBeNull();
    const msg = result.messages![result.messages!.length - 1] as AIMessage;
    expect((msg.content as string).toLowerCase()).toContain("no encontr");
  });

  it("5+ resultados → muestra todas las opciones", async () => {
    mockSearchCustomers.mockResolvedValueOnce([
      { id: "c1", label: "Acme Piscicola" },
      { id: "c2", label: "Acme Trading" },
      { id: "c3", label: "Acme Industrial" },
      { id: "c4", label: "Acme Servicios" },
      { id: "c5", label: "Acme Tecnología" },
    ]);
    const state = makeState({ messages: [new HumanMessage("Acme")] });
    const result = await clarifyNode(state);
    expect(result.clarificationOptions!.options).toHaveLength(5);
  });
});

// ============================================================
// SECTION 12: Agenda node — variaciones
// ============================================================

describe("Agenda node — variaciones", () => {
  beforeEach(() => {
    mockGetPendingTasks.mockResolvedValue([
      { id: "task-1", title: "Llamar a cliente", dueAt: "2026-05-10T10:00:00.000Z", type: "llamada" },
    ]);
    mockGetScheduledVisits.mockResolvedValue([
      { id: "visit-1", summary: "Visita técnica", scheduledAt: "2026-05-11T15:00:00.000Z" },
    ]);
  });

  it("retorna items de tasks y visits combinados", async () => {
    const state = makeState({ messages: [new HumanMessage("qué tengo hoy?")] });
    const result = await agendaNode(state);
    expect(result.agendaItems).toHaveLength(2);
    expect(result.agendaItems![0].type).toBe("follow_up_task");
    expect(result.agendaItems![1].type).toBe("visit");
  });

  it("agenda vacía → mensaje informativo", async () => {
    mockGetPendingTasks.mockResolvedValueOnce([]);
    mockGetScheduledVisits.mockResolvedValueOnce([]);
    const state = makeState({ messages: [new HumanMessage("mi agenda")] });
    const result = await agendaNode(state);
    expect(result.agendaItems).toHaveLength(0);
    const msg = result.messages![result.messages!.length - 1] as AIMessage;
    expect((msg.content as string).toLowerCase()).toContain("no encontr");
  });

  it("solo tasks, sin visits → agenda con solo tasks", async () => {
    mockGetScheduledVisits.mockResolvedValueOnce([]);
    const state = makeState({ messages: [new HumanMessage("pendientes")] });
    const result = await agendaNode(state);
    expect(result.agendaItems).toHaveLength(1);
    expect(result.agendaItems![0].type).toBe("follow_up_task");
  });
});

// ============================================================
// SECTION 13: Build proposal node — variaciones
// ============================================================

describe("Build proposal node — variaciones", () => {
  it("con customer context → todos los bloques persistibles habilitados", async () => {
    const state = makeState({
      messages: [new HumanMessage("Estuve con Acme, quieren el sistema")],
      customerContext: { id: "cust-acme", label: "Acme Piscicola" },
      _extractionResult: {
        intent: "report",
        interactionSummary: "Reunión con Acme sobre sistema de inventario",
        suggestedOpportunityTitle: "Sistema de inventario - Acme",
        suggestedOpportunityStage: "visita",
        suggestedNextStep: "Programar demo",
        suggestedFollowUpDate: "2026-05-10T15:00:00.000Z",
        suggestedTaskTitle: "Preparar propuesta",
        taskType: "llamada",
        signals: { objections: ["precio"], risk: "medio", buyingIntent: "alto" },
      },
    });

    const result = await buildProposalNode(state);
    expect(result.proposal!.blocks.interaction!.enabled).toBe(true);
    expect(result.proposal!.blocks.opportunity!.enabled).toBe(true);
    expect(result.proposal!.blocks.opportunity!.createNew).toBe(true);
    expect(result.proposal!.blocks.followUp!.enabled).toBe(true);
    expect(result.proposal!.blocks.task!.enabled).toBe(true);
    expect(result.proposal!.blocks.signals!.enabled).toBe(true);
    expect(result.proposal!.blocks.signals!.objections).toEqual(["precio"]);
    expect(result.proposalStatus).toBe("draft");
    expect(result.proposalId).toBeDefined();
  });

  it("sin customer context → bloques persistibles deshabilitados", async () => {
    const state = makeState({
      messages: [new HumanMessage("Necesito seguimiento")],
      customerContext: null,
      _extractionResult: { interactionSummary: "Seguimiento pendiente" },
    });

    const result = await buildProposalNode(state);
    expect(result.proposal!.blocks.interaction!.enabled).toBe(false);
    expect(result.proposal!.blocks.opportunity!.enabled).toBe(false);
    expect(result.proposal!.blocks.followUp!.enabled).toBe(false);
    expect(result.proposal!.blocks.task!.enabled).toBe(false);
  });

  it("sin extraction result → usa mensaje del usuario como fallback", async () => {
    const state = makeState({
      messages: [new HumanMessage("Reporte del día")],
      customerContext: { id: "cust-1", label: "Cliente" },
      _extractionResult: null,
    });

    const result = await buildProposalNode(state);
    expect(result.proposal).toBeDefined();
    expect(result.proposal!.blocks.interaction!.rawMessage).toBe("Reporte del día");
    expect(result.proposal!.blocks.interaction!.summary).toBe("Reporte del día");
  });

  it("con opportunity context → no crea oportunidad nueva", async () => {
    const state = makeState({
      messages: [new HumanMessage("Seguimiento")],
      customerContext: { id: "cust-1", label: "Cliente" },
      opportunityContext: { id: "opp-1", label: "Sistema de inventario" },
      _extractionResult: {
        interactionSummary: "Seguimiento",
        suggestedNextStep: "Llamar mañana",
      },
    });

    const result = await buildProposalNode(state);
    expect(result.proposal!.blocks.opportunity!.createNew).toBe(false);
    expect(result.proposal!.blocks.opportunity!.opportunityId).toBe("opp-1");
  });

  it("proposalId preservado si ya existe en estado", async () => {
    const state = makeState({
      messages: [new HumanMessage("Refinamiento")],
      proposalId: "existing-id",
      customerContext: { id: "cust-1", label: "Cliente" },
      _extractionResult: { interactionSummary: "Refinamiento" },
    });

    const result = await buildProposalNode(state);
    expect(result.proposalId).toBe("existing-id");
  });
});

// ============================================================
// SECTION 14: Greeting node
// ============================================================

describe("Greeting node", () => {
  it("retorna mensaje de bienvenida en español con el nombre Laura", async () => {
    const state = makeState({ messages: [new HumanMessage("hola")] });
    const result = await greetingNode(state);
    expect(result.mode).toBe("greeting");
    expect(result.messages).toHaveLength(2);
    const msg = result.messages![1] as AIMessage;
    expect((msg.content as string).toLowerCase()).toContain("laura");
    expect((msg.content as string).toLowerCase()).toContain("hola");
  });

  it("preserva mensajes existentes y agrega respuesta", async () => {
    const state = makeState({ messages: [new HumanMessage("buenas tardes")] });
    const result = await greetingNode(state);
    expect(result.messages!.length).toBe(2);
  });
});

// ============================================================
// SECTION 15: Platform node
// ============================================================

describe("Platform node — planner orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockPlannerResponse(payload: Record<string, unknown>) {
    mockCreateLlm.mockReturnValueOnce({
      invoke: vi.fn().mockResolvedValue(new AIMessage({ content: JSON.stringify(payload) })),
    });
  }

  it("retorna clarification cuando la validación encuentra campos faltantes", async () => {
    mockPlannerResponse({
      intent: "write",
      summary: "Crear seguimiento",
      actions: [
        {
          domain: "followups",
          action: "create",
          arguments: { title: "Llamar a Acme" },
          confidence: 0.9,
        },
      ],
      requiresConfirmation: true,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("crea un seguimiento para Acme")] }));

    expect(result.mode).toBe("clarification");
    expect(result.lastError).toContain("customerId");
    expect(result.lastError).toContain("dueAt");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect(lastMsg.content as string).toContain("cliente");
    expect(lastMsg.content as string).toContain("fecha y hora");
  });

  it("retorna greeting para planes de saludo", async () => {
    mockPlannerResponse({
      intent: "greeting",
      summary: "Hola, soy Laura. ¿Qué necesitás hacer en el CRM?",
      actions: [],
      requiresConfirmation: false,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("hola")] }));

    expect(result.mode).toBe("greeting");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect(lastMsg.content as string).toContain("Hola");
  });

  it("normaliza saludos robóticos del planner a una respuesta natural", async () => {
    mockPlannerResponse({
      intent: "greeting",
      summary: "El usuario está saludando de manera informal.",
      actions: [],
      requiresConfirmation: false,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("dimelo my girl")] }));

    expect(result.mode).toBe("greeting");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect(lastMsg.content as string).toContain("Hola");
    expect((lastMsg.content as string).toLowerCase()).not.toContain("el usuario");
  });

  it("retorna qa con mensaje de ayuda para planes help", async () => {
    mockPlannerResponse({
      intent: "help",
      summary: "Puedo ayudarte con clientes, oportunidades y tareas del CRM.",
      actions: [],
      requiresConfirmation: false,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("que podes hacer?")] }));

    expect(result.mode).toBe("qa");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect(lastMsg.content as string).toContain("Puedo ayudarte");
  });

  it("normaliza ayudas interrogativas del planner a una explicación directa sobre oportunidades", async () => {
    mockPlannerResponse({
      intent: "help",
      summary: "¿Querés que te explique los pasos para crear una oportunidad en el CRM?",
      actions: [],
      requiresConfirmation: false,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("como creamos una oportunidad?")] }));

    expect(result.mode).toBe("qa");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect((lastMsg.content as string).toLowerCase()).toContain("oportunidad");
    expect((lastMsg.content as string).toLowerCase()).toContain("cliente");
    expect((lastMsg.content as string).toLowerCase()).toContain("etapa");
    expect((lastMsg.content as string)).not.toContain("¿Querés");
  });

  it("usa el contexto reciente para responder una confirmación corta sobre cotizaciones", async () => {
    mockPlannerResponse({
      intent: "help",
      summary: "¿Querés que te explique los requisitos para crear una cotización en el CRM?",
      actions: [],
      requiresConfirmation: false,
    });

    const result = await platformNode(makeState({
      messages: [
        new HumanMessage("y para hacer una cotizacion que necesitamos?"),
        new AIMessage("¿Querés que te explique los requisitos para crear una cotización en el CRM?"),
        new HumanMessage("que si"),
      ],
    }));

    expect(result.mode).toBe("qa");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect((lastMsg.content as string).toLowerCase()).toContain("cotización");
    expect((lastMsg.content as string).toLowerCase()).toContain("cliente");
    expect((lastMsg.content as string).toLowerCase()).not.toContain("¿querés");
  });

  it("retorna qa explicando acciones no soportadas", async () => {
    mockPlannerResponse({
      intent: "unsupported",
      summary: "Todavía no puedo eliminar clientes en lote.",
      actions: [],
      requiresConfirmation: false,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("elimina todos los clientes")] }));

    expect(result.mode).toBe("qa");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect(lastMsg.content as string).toContain("no puedo");
  });

  it("retorna clarification para planes de aclaración explícitos", async () => {
    mockPlannerResponse({
      intent: "clarification",
      summary: "Necesito saber a qué cliente te referís.",
      actions: [],
      requiresConfirmation: false,
      clarificationQuestion: "¿De qué cliente hablamos?",
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("necesito actualizarlo")] }));

    expect(result.mode).toBe("clarification");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect(lastMsg.content as string).toContain("¿De qué cliente hablamos?");
  });

  it("pide aclaración antes de modificar una visita ambigua", async () => {
    mockPlannerResponse({
      intent: "write",
      summary: "Cancelar visita",
      actions: [
        {
          domain: "visits",
          action: "cancel",
          arguments: {
            reason: "Conflicto de agenda",
          },
          confidence: 0.94,
          role: "primary",
          humanSummary: "Cancelar visita",
        },
      ],
      ambiguity: ["multiple_visits"],
      clarificationQuestion: "Encontré más de una visita posible. ¿Cuál visita querés cancelar?",
      requiresConfirmation: true,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("cancela la visita de mañana")] }));

    expect(result.mode).toBe("clarification");
    expect(result.proposal).toBeUndefined();
    expect(result.lastError).toContain("multiple_visits");
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect((lastMsg.content as string).toLowerCase()).toContain("visita");
    expect((lastMsg.content as string).toLowerCase()).toContain("cuál");
  });

  it("retorna proposal para planes de escritura validados", async () => {
    mockPlannerResponse({
      intent: "write",
      summary: "Crear seguimiento",
      actions: [
        {
          domain: "followups",
          action: "create",
          arguments: {
            customerId: "customer-1",
            title: "Llamar a Acme",
            dueAt: "2026-05-12T15:00:00.000Z",
            type: "llamada",
          },
          confidence: 0.91,
        },
      ],
      requiresConfirmation: true,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("programa llamada con Acme")] }));

    expect(result.mode).toBe("proposal");
    expect(result.proposalId).toBeDefined();
    expect(result.proposalStatus).toBe("draft");
    expect(result.proposal!.blocks.followUp).toMatchObject({
      enabled: true,
      action: "create",
      title: "Llamar a Acme",
    });
    expect(mockCreateFollowUp).not.toHaveBeenCalled();
  });

  it("infiere legalName desde el mensaje cuando el planner omite el nombre del cliente a crear", async () => {
    mockPlannerResponse({
      intent: "write",
      summary: "Crear cliente",
      actions: [
        {
          domain: "customers",
          action: "create",
          arguments: {},
          confidence: 0.91,
        },
      ],
      requiresConfirmation: true,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("registrame este cliente aquavet")] }));

    expect(result.mode).toBe("proposal");
    expect(result.proposal?.blocks.customer).toMatchObject({
      enabled: true,
      action: "create",
      legalName: "aquavet",
      displayName: "aquavet",
    });
  });

  it("convierte datos de contacto en actualizacion del cliente activo aunque el planner proponga contacto", async () => {
    mockPlannerResponse({
      intent: "write",
      summary: "Crear contacto",
      actions: [
        {
          domain: "contacts",
          action: "create",
          arguments: {
            customerId: "customer-1",
            fullName: "aquavet",
            email: "aquavet@sbi.com",
            phone: "3728393827839",
          },
          confidence: 0.91,
        },
      ],
      requiresConfirmation: true,
    });

    const result = await platformNode(makeState({
      messages: [new HumanMessage("mira el correo aquavet@sbi.com y telefono 3728393827839")],
      proposal: {
        blocks: {
          customer: {
            enabled: true,
            action: "create",
            legalName: "aquavet",
            displayName: "aquavet",
          },
        },
      },
      proposalStatus: "draft",
      proposalId: "prop-1",
    }));

    expect(result.mode).toBe("proposal");
    expect(result.proposalId).toBe("prop-1");
    expect(result.proposal?.blocks.customer).toMatchObject({
      enabled: true,
      action: "create",
      legalName: "aquavet",
      email: "aquavet@sbi.com",
      phone: "3728393827839",
    });
    expect(result.proposal?.blocks.contact).toBeUndefined();
  });

  it("retorna clarification cuando la propuesta no tiene bloques habilitados", async () => {
    mockPlannerResponse({
      intent: "write",
      summary: "Actualizar producto",
      actions: [
        {
          domain: "products",
          action: "update",
          arguments: { productId: "product-1" },
          confidence: 0.91,
        },
      ],
      requiresConfirmation: true,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("actualiza el producto")] }));

    expect(result.mode).toBe("clarification");
    expect(result.proposal).toBeUndefined();
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect(lastMsg.content as string).toContain("No pude preparar una propuesta valida");
  });

  it("responde estado de cotización con detalle contextual cuando el planner marca lectura adaptativa", async () => {
    mockGetQuoteDetails.mockResolvedValueOnce({
      id: "quote-9",
      status: "pending_approval",
      customerName: "Acme Piscicola",
      opportunityId: "opp-77",
      riskLabel: "alto",
      validUntil: "2026-05-30T15:00:00.000Z",
    });
    mockPlannerResponse({
      intent: "read",
      summary: "Voy a revisar el estado de la cotización y el riesgo comercial asociado.",
      responseStyle: "adaptive",
      actions: [
        {
          domain: "quotes",
          action: "detail",
          arguments: { quoteId: "quote-9" },
          confidence: 0.93,
          role: "primary",
          humanSummary: "Consultar estado de cotización",
        },
      ],
      requiresConfirmation: false,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("cómo va la cotización de Acme?")] }));

    expect(result.mode).toBe("query");
    expect(result.data).toMatchObject({
      entityType: "quotes",
      action: "detail",
      data: {
        id: "quote-9",
        status: "pending_approval",
        customerName: "Acme Piscicola",
        riskLabel: "alto",
        opportunityId: "opp-77",
      },
    });
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect(lastMsg.content as string).toBe("Detalle de quotes.");
  });

  it("genera propuesta multiacción con impacto relacionado y lecturas mixtas", async () => {
    mockGetOrderDetails.mockResolvedValueOnce({
      id: "order-4",
      status: "open",
      customerName: "Acme Piscicola",
    });
    mockPlannerResponse({
      intent: "mixed",
      summary: "Reprogramar visita y mover seguimiento relacionado.",
      responseStyle: "adaptive",
      actions: [
        {
          domain: "visits",
          action: "update",
          arguments: {
            visitId: "visit-1",
            scheduledAt: "2026-05-20T14:00:00.000Z",
            summary: "Visita reprogramada con Acme",
          },
          confidence: 0.95,
          role: "primary",
          humanSummary: "Reprogramar visita",
        },
        {
          domain: "followups",
          action: "update",
          arguments: {
            followupId: "followup-1",
            dueAt: "2026-05-20T17:00:00.000Z",
            notes: "Mover seguimiento después de la visita",
          },
          confidence: 0.92,
          role: "related",
          relatedTo: "visit-1",
          humanSummary: "Mover seguimiento relacionado",
        },
        {
          domain: "orders",
          action: "detail",
          arguments: { orderId: "order-4" },
          confidence: 0.88,
          role: "primary",
          humanSummary: "Consultar pedido asociado",
        },
      ],
      requiresConfirmation: true,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("reprograma la visita del jueves y mové también el seguimiento")] }));

    expect(result.mode).toBe("proposal");
    expect(result.proposalStatus).toBe("draft");
    expect(result.proposal?.summary).toMatchObject({
      primaryCount: 1,
      relatedCount: 1,
      primaryActions: ["visits.update"],
      relatedActions: ["followups.update"],
      relatedToIds: ["visit-1"],
      labels: ["Reprogramar visita", "Mover seguimiento relacionado"],
    });
    expect(result.proposal?.blocks.visit).toMatchObject({
      enabled: true,
      action: "update",
      id: "visit-1",
      scheduledAt: "2026-05-20T14:00:00.000Z",
    });
    expect(result.proposal?.blocks.followUp).toMatchObject({
      enabled: true,
      action: "update",
      id: "followup-1",
      dueAt: "2026-05-20T17:00:00.000Z",
    });
    const lastMsg = result.messages![result.messages!.length - 1] as AIMessage;
    expect(lastMsg.content as string).toContain("Preparé una propuesta");
    expect(lastMsg.content as string).toContain("Tambien detecté informacion relacionada");
  });

  it("retorna query y data para planes de lectura validados", async () => {
    mockSearchProducts.mockResolvedValueOnce([{ id: "product-1", name: "Sensor IoT" }]);
    mockPlannerResponse({
      intent: "read",
      summary: "Buscar productos",
      actions: [
        {
          domain: "products",
          action: "search",
          arguments: { search: "sensor" },
          confidence: 0.92,
        },
      ],
      requiresConfirmation: false,
    });

    const result = await platformNode(makeState({ messages: [new HumanMessage("mostra productos sensor")] }));

    expect(result.mode).toBe("query");
    expect(result.data).toMatchObject({
      entityType: "products",
      action: "list",
      data: [{ id: "product-1", name: "Sensor IoT" }],
    });
    expect(mockSearchProducts).toHaveBeenCalledWith({ search: "sensor", active: undefined });
  });

  it("compiled graph platform path appends only the AI response message", async () => {
    mockSearchProducts.mockResolvedValueOnce([{ id: "product-1", name: "Sensor IoT" }]);
    mockPlannerResponse({
      intent: "read",
      summary: "Buscar productos",
      actions: [
        {
          domain: "products",
          action: "search",
          arguments: { search: "sensor" },
          confidence: 0.92,
        },
      ],
      requiresConfirmation: false,
    });

    const graph = createLauraGraph();
    const result = await graph.invoke(makeState({ messages: [new HumanMessage("mostra productos sensor")] }));

    expect(result.mode).toBe("query");
    expect(result.messages).toHaveLength(2);
    expect(result.messages.filter((message) => message._getType() === "human")).toHaveLength(1);
    expect(result.messages.filter((message) => message._getType() === "ai")).toHaveLength(1);
  });
});

// ============================================================
// SECTION 16: State transitions — flujo completo simulado
// ============================================================

describe("Flujo completo — simulación de conversación", () => {
  it("Flujo: saludo → reporte → propuesta → confirmar", async () => {
    const sessionId = "flow-test-1";

    const msg1 = new HumanMessage("hola");
    const step1 = await routerNode(makeState({ messages: [msg1], sessionId }));
    expect(step1.mode).toBe("platform");

    const msg2 = new HumanMessage("Estuve con Acme Piscicola, quieren el sistema");
    const step2 = await routerNode(makeState({
      messages: [msg1, new AIMessage("¡Hola!..."), msg2],
      sessionId,
      mode: "greeting",
    }));
    expect(step2.mode).toBe("platform");

    const msg3 = new HumanMessage("confirmo la propuesta");
    const step3 = await routerNode(makeState({
      messages: [msg1, new AIMessage("¡Hola!..."), msg2, new AIMessage("Propuesta..."), msg3],
      sessionId,
      mode: "proposal",
      proposal: makeProposal(),
      proposalId: "prop-flow-1",
      proposalStatus: "draft",
      customerContext: { id: "cust-1", label: "Acme" },
    }));
    expect(step3.mode).toBe("confirm");
  });

  it("Flujo: saludo → agenda → proposal → descartar", async () => {
    const sessionId = "flow-test-2";

    const step1 = await routerNode(makeState({ messages: [new HumanMessage("hola")], sessionId }));
    expect(step1.mode).toBe("platform");

    const step2 = await routerNode(makeState({ messages: [new HumanMessage("qué tengo pendiente hoy?")], sessionId }));
    expect(step2.mode).toBe("platform");

    const step3 = await routerNode(makeState({ messages: [new HumanMessage("visité a un cliente nuevo")], sessionId }));
    expect(step3.mode).toBe("platform");

    const step4 = await routerNode(makeState({
      messages: [new HumanMessage("descartar")],
      sessionId,
      proposal: makeProposal(),
      proposalId: "prop-flow-2",
      proposalStatus: "draft",
    }));
    expect(step4.mode).toBe("discard");
  });

  it("Flujo: propuesta → refinar → confirmar", async () => {
    const sessionId = "flow-test-3";
    const proposal = makeProposal();

    const step1 = await routerNode(makeState({
      messages: [new HumanMessage("cambia el título")],
      sessionId,
      proposal,
      proposalId: "prop-1",
      proposalStatus: "draft",
    }));
    expect(step1.mode).toBe("refine");

    const step2 = await routerNode(makeState({
      messages: [new HumanMessage("guardalo")],
      sessionId,
      proposal,
      proposalId: "prop-1",
      proposalStatus: "draft",
    }));
    expect(step2.mode).toBe("confirm");
  });

  it("Flujo: propuesta → refinar → descartar", async () => {
    const sessionId = "flow-test-4";
    const proposal = makeProposal();

    const step1 = await routerNode(makeState({
      messages: [new HumanMessage("modifica algo")],
      sessionId,
      proposal,
      proposalId: "prop-1",
      proposalStatus: "draft",
    }));
    expect(step1.mode).toBe("refine");

    const step2 = await routerNode(makeState({
      messages: [new HumanMessage("cancelar")],
      sessionId,
      proposal,
      proposalId: "prop-1",
      proposalStatus: "draft",
    }));
    expect(step2.mode).toBe("discard");
  });
});

// ============================================================
// SECTION 16: E2E conversation flows
// ============================================================

describe("E2E conversation flows", () => {
  it("should handle full query flow: products", async () => {
    const state = makeState({
      messages: [new HumanMessage("que productos tenemos?")],
      sessionId: "e2e-query-1",
    });
    const routed = await routerNode(state);
    expect(routed.mode).toBe("platform");
  });

  it("should handle modify flow: change followup time with context", async () => {
    const stateWithContext = makeState({
      messages: [new HumanMessage("cambia la hora del seguimiento a las 14:20")],
      sessionId: "e2e-modify-1",
      mentionedEntities: { followupId: "test-id-123" },
    });
    const routed = await routerNode(stateWithContext);
    expect(routed.mode).toBe("platform");
  });

  it("should route create quote request to 'platform'", async () => {
    const state = makeState({
      messages: [new HumanMessage("crea una cotizacion para Carlos Mendoza con 10 bolsas de semilla")],
      sessionId: "e2e-create-1",
      customerContext: { id: "cust-1", label: "Carlos Mendoza" },
    });
    const routed = await routerNode(state);
    expect(routed.mode).toBe("platform");
  });

  it("full flow: platform product read → platform followup write → platform report", async () => {
    const sessionId = "e2e-full-1";

    const step1 = await routerNode(makeState({
      messages: [new HumanMessage("que productos tenemos?")],
      sessionId,
    }));
    expect(step1.mode).toBe("platform");

    const step2 = await routerNode(makeState({
      messages: [new HumanMessage("reprograma el seguimiento del lunes para el martes")],
      sessionId,
    }));
    expect(step2.mode).toBe("platform");

    const step3 = await routerNode(makeState({
      messages: [new HumanMessage("estuve con un cliente y quieren cotizacion")],
      sessionId,
    }));
    expect(step3.mode).toBe("platform");
  });

  it("full flow: greeting → agenda → platform read → platform report → confirm", async () => {
    const sessionId = "e2e-full-2";

    const step1 = await routerNode(makeState({ messages: [new HumanMessage("buenos dias")], sessionId }));
    expect(step1.mode).toBe("platform");

    const step2 = await routerNode(makeState({ messages: [new HumanMessage("que tengo pendiente")], sessionId }));
    expect(step2.mode).toBe("platform");

    const step3 = await routerNode(makeState({ messages: [new HumanMessage("cuantas cotizaciones abiertas hay?")], sessionId }));
    expect(step3.mode).toBe("platform");

    const step4 = await routerNode(makeState({ messages: [new HumanMessage("visite a Agro SA, quieren el sistema")], sessionId }));
    expect(step4.mode).toBe("platform");

    const step5 = await routerNode(makeState({
      messages: [new HumanMessage("confirmo")],
      sessionId,
      proposal: makeProposal(),
      proposalId: "prop-e2e",
      proposalStatus: "draft",
    }));
    expect(step5.mode).toBe("confirm");
  });
});
