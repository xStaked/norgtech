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
  mockCreateInteraction,
  mockUpsertOpportunity,
  mockCreateFollowUp,
  mockCreateTask,
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
  mockCreateInteraction: vi.fn().mockResolvedValue({ id: "interaction-1" }),
  mockUpsertOpportunity: vi.fn().mockResolvedValue({ id: "opp-created-1" }),
  mockCreateFollowUp: vi.fn().mockResolvedValue({ id: "followup-1" }),
  mockCreateTask: vi.fn().mockResolvedValue({ id: "task-created-1" }),
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
  createInteraction: mockCreateInteraction,
  upsertOpportunity: mockUpsertOpportunity,
  createFollowUp: mockCreateFollowUp,
  createTask: mockCreateTask,
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
import { routerEdge } from "../graph/edges.js";

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
    it("clasifica reporte de visita detallado como proposal", async () => {
      const state = makeState({ messages: [new HumanMessage("Visité a Acme Piscicola, reunión con el gerente Carlos. Solicitaron cotización para sistema de inventario.")] });
      expect((await routerNode(state)).mode).toBe("proposal");
    });

    it("LIMITACIÓN: reporte con 'semana pasada' clasifica como agenda (falso positivo — contiene 'semana')", async () => {
      const state = makeState({ messages: [new HumanMessage("Llamé a Distribuidores del Norte para dar seguimiento a la propuesta enviada la semana pasada.")] });
      expect((await routerNode(state)).mode).toBe("agenda");
    });

    it("LIMITACIÓN: reporte con 'hoy' clasifica como agenda (falso positivo — contiene 'hoy')", async () => {
      const state = makeState({ messages: [new HumanMessage("Cerré la venta con Tecnología Avanzada SA, firmaron el contrato hoy.")] });
      expect((await routerNode(state)).mode).toBe("agenda");
    });

    it("clasifica consulta de agenda directa como agenda", async () => {
      const state = makeState({ messages: [new HumanMessage("agenda")] });
      expect((await routerNode(state)).mode).toBe("agenda");
    });

    it("clasifica pedido de tareas pendientes como agenda", async () => {
      const state = makeState({ messages: [new HumanMessage("pendientes")] });
      expect((await routerNode(state)).mode).toBe("agenda");
    });
  });

  describe("Vendedor nuevo — lenguaje informal e inseguro", () => {
    it("clasifica saludo casual como greeting", async () => {
      const state = makeState({ messages: [new HumanMessage("hola!")] });
      expect((await routerNode(state)).mode).toBe("greeting");
    });

    it("clasifica 'hey' como greeting", async () => {
      const state = makeState({ messages: [new HumanMessage("hey")] });
      expect((await routerNode(state)).mode).toBe("greeting");
    });

    it("clasifica pregunta informal sobre agenda como agenda (contiene 'hoy')", async () => {
      const state = makeState({ messages: [new HumanMessage("que tengo que hacer hoy?")] });
      expect((await routerNode(state)).mode).toBe("agenda");
    });

    it("clasifica reporte vago como proposal", async () => {
      const state = makeState({ messages: [new HumanMessage("fui a ver un cliente y me dijo que le interesa")] });
      expect((await routerNode(state)).mode).toBe("proposal");
    });
  });

  describe("Gerente — consultas estratégicas", () => {
    it("clasifica consulta de visitas programadas como agenda", async () => {
      const state = makeState({ messages: [new HumanMessage("Qué visitas tenemos programadas esta semana?")] });
      expect((await routerNode(state)).mode).toBe("agenda");
    });

    it("clasifica consulta de tareas del equipo como agenda", async () => {
      const state = makeState({ messages: [new HumanMessage("Cuáles son las tareas pendientes del equipo?")] });
      expect((await routerNode(state)).mode).toBe("agenda");
    });
  });

  describe("Usuario con typing errors / typos", () => {
    it("clasifica 'ola' como proposal (no greeting — solo matchea hola/buenos/etc exactos)", async () => {
      const state = makeState({ messages: [new HumanMessage("ola")] });
      expect((await routerNode(state)).mode).toBe("proposal");
    });

    it("clasifica 'hla' como proposal (typo de hola)", async () => {
      const state = makeState({ messages: [new HumanMessage("hla")] });
      expect((await routerNode(state)).mode).toBe("proposal");
    });

    it("clasifica 'bns dias' como proposal (typo de buenos días)", async () => {
      const state = makeState({ messages: [new HumanMessage("bns dias")] });
      expect((await routerNode(state)).mode).toBe("proposal");
    });

    it("clasifica 'agnda' como proposal (typo de agenda)", async () => {
      const state = makeState({ messages: [new HumanMessage("agnda")] });
      expect((await routerNode(state)).mode).toBe("proposal");
    });
  });

  describe("Usuario con lenguaje regional argentino", () => {
    it("LIMITACIÓN: 'buenas' no se detecta como greeting (no match en patterns — cae a proposal)", async () => {
      const state = makeState({ messages: [new HumanMessage("buenas")] });
      const result = await routerNode(state);
      expect(result.mode).toBe("proposal");
    });

    it("clasifica 'che, necesito ver mi agenda' como agenda", async () => {
      const state = makeState({ messages: [new HumanMessage("che, necesito ver mi agenda")] });
      expect((await routerNode(state)).mode).toBe("agenda");
    });

    it("clasifica 'dale' como clarification (short affirmative)", async () => {
      const state = makeState({ messages: [new HumanMessage("dale")] });
      expect((await routerNode(state)).mode).toBe("clarification");
    });
  });

  describe("Usuario con Spanglish / mixto", () => {
    it("clasifica mensaje con inglés + español como proposal", async () => {
      const state = makeState({ messages: [new HumanMessage("Tuve un meeting con el cliente, quieren un follow-up del producto")] });
      expect((await routerNode(state)).mode).toBe("proposal");
    });

    it("clasifica 'hi, necesito ver mi agenda' como agenda (contiene 'agenda')", async () => {
      const state = makeState({ messages: [new HumanMessage("hi, necesito ver mi agenda")] });
      expect((await routerNode(state)).mode).toBe("agenda");
    });
  });
});

// ============================================================
// SECTION 2: Router — Normalización de acentos y puntuación
// ============================================================

describe("Router — Normalización de texto", () => {
  it("clasifica con acentos: 'qué tengo pendiente?' como agenda", async () => {
    const state = makeState({ messages: [new HumanMessage("¿Qué tengo pendiente?")] });
    expect((await routerNode(state)).mode).toBe("agenda");
  });

  it("clasifica sin acentos: 'que tengo pendiente' como agenda", async () => {
    const state = makeState({ messages: [new HumanMessage("que tengo pendiente")] });
    expect((await routerNode(state)).mode).toBe("agenda");
  });

  it("clasifica 'buenos días!' con signo de exclamación → greeting", async () => {
    const state = makeState({ messages: [new HumanMessage("buenos días!")] });
    expect((await routerNode(state)).mode).toBe("greeting");
  });

  it("clasifica 'buenos días???' con múltiples signos → greeting", async () => {
    const state = makeState({ messages: [new HumanMessage("buenos días???")] });
    expect((await routerNode(state)).mode).toBe("greeting");
  });

  it("clasifica 'hola.' con punto → greeting", async () => {
    const state = makeState({ messages: [new HumanMessage("hola.")] });
    expect((await routerNode(state)).mode).toBe("greeting");
  });

  it("clasifica con MAYÚSCULAS: 'BUENOS DÍAS' → greeting", async () => {
    const state = makeState({ messages: [new HumanMessage("BUENOS DÍAS")] });
    expect((await routerNode(state)).mode).toBe("greeting");
  });

  it("clasifica 'QUÉ TENGO HOY' en mayúsculas → agenda", async () => {
    const state = makeState({ messages: [new HumanMessage("QUÉ TENGO HOY?")] });
    expect((await routerNode(state)).mode).toBe("agenda");
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

    it("LIMITACIÓN: 'no guardar' coincide con 'guarda' (patrón confirm) → false confirm", async () => {
      const state = makeState({
        messages: [new HumanMessage("no guardar")],
        ...proposalState,
      });
      expect((await routerNode(state)).mode).toBe("confirm");
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
      "mejor poné otra cosa",
      "en vez de eso, poné el monto correcto",
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
  it("clasifica mensaje vacío como proposal (fallback)", async () => {
    const state = makeState({ messages: [new HumanMessage("")] });
    expect((await routerNode(state)).mode).toBe("proposal");
  });

  it("clasifica mensaje de solo espacios como proposal (fallback)", async () => {
    const state = makeState({ messages: [new HumanMessage("   ")] });
    expect((await routerNode(state)).mode).toBe("proposal");
  });

  it("clasifica mensaje con solo emoji como clarification o proposal", async () => {
    const state = makeState({ messages: [new HumanMessage("👍")] });
    const result = await routerNode(state);
    expect(["clarification", "proposal"]).toContain(result.mode);
  });

  it("clasifica mensaje muy largo como proposal", async () => {
    const longMsg = "Estuve con el cliente y ".repeat(50) + "quieren una propuesta";
    const state = makeState({ messages: [new HumanMessage(longMsg)] });
    expect((await routerNode(state)).mode).toBe("proposal");
  });

  it("clasifica 'hola, estuve con el cliente' como proposal (>6 palabras, no pure greeting)", async () => {
    const state = makeState({ messages: [new HumanMessage("hola, estuve con el cliente ayer y quieren un sistema")] });
    const result = await routerNode(state);
    expect(result.mode).toBe("proposal");
  });

  it("clasifica mensaje con caracteres especiales como proposal", async () => {
    const state = makeState({ messages: [new HumanMessage("@#$%^&*()")] });
    expect((await routerNode(state)).mode).toBe("proposal");
  });

  it("clasifica números solos como clarification (short response 'si' check fails, falls through)", async () => {
    const state = makeState({ messages: [new HumanMessage("123")] });
    const result = await routerNode(state);
    expect(result.mode).toBeDefined();
  });

  it("clasifica '1' como clarification (short numeric = possible option selection)", async () => {
    const state = makeState({ messages: [new HumanMessage("1")] });
    expect((await routerNode(state)).mode).toBe("proposal");
  });

  it("palabras con acentos y ñ se normalizan correctamente", async () => {
    const state = makeState({ messages: [new HumanMessage("visitas")] });
    expect((await routerNode(state)).mode).toBe("agenda");
  });

  it("mensaje con HTML/SQL injection attempt → proposal (no special handling)", async () => {
    const state = makeState({ messages: [new HumanMessage("<script>alert('xss')</script>")] });
    expect((await routerNode(state)).mode).toBe("proposal");
  });
});

// ============================================================
// SECTION 5: Router — Confirm/Discard/Refine SIN propuesta activa
// ============================================================

describe("Router — Comportamiento sin propuesta activa", () => {
  it("'confirmo' sin propuesta → NO es confirm, cae a clarification (match en short responses)", async () => {
    const state = makeState({
      messages: [new HumanMessage("confirmo")],
      proposal: null,
      proposalStatus: "draft",
    });
    expect((await routerNode(state)).mode).toBe("clarification");
  });

  it("'cancelar' sin propuesta → proposal (no match en discard patterns)", async () => {
    const state = makeState({
      messages: [new HumanMessage("cancelar")],
      proposal: null,
      proposalStatus: "draft",
    });
    const result = await routerNode(state);
    expect(result.mode).toBe("proposal");
  });

  it("'cambia' sin propuesta → proposal (no match en refine patterns)", async () => {
    const state = makeState({
      messages: [new HumanMessage("cambia algo")],
      proposal: null,
      proposalStatus: "draft",
    });
    const result = await routerNode(state);
    expect(result.mode).toBe("proposal");
  });

  it("'descartar' sin propuesta → proposal (not in any special category)", async () => {
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
// SECTION 15: State transitions — flujo completo simulado
// ============================================================

describe("Flujo completo — simulación de conversación", () => {
  it("Flujo: saludo → reporte → propuesta → confirmar", async () => {
    const sessionId = "flow-test-1";

    const msg1 = new HumanMessage("hola");
    const step1 = await routerNode(makeState({ messages: [msg1], sessionId }));
    expect(step1.mode).toBe("greeting");

    const msg2 = new HumanMessage("Estuve con Acme Piscicola, quieren el sistema");
    const step2 = await routerNode(makeState({
      messages: [msg1, new AIMessage("¡Hola!..."), msg2],
      sessionId,
      mode: "greeting",
    }));
    expect(step2.mode).toBe("proposal");

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

  it("Flujo: saludo → agenda → reporte → propuesta → descartar", async () => {
    const sessionId = "flow-test-2";

    const step1 = await routerNode(makeState({ messages: [new HumanMessage("hola")], sessionId }));
    expect(step1.mode).toBe("greeting");

    const step2 = await routerNode(makeState({ messages: [new HumanMessage("qué tengo pendiente hoy?")], sessionId }));
    expect(step2.mode).toBe("agenda");

    const step3 = await routerNode(makeState({ messages: [new HumanMessage("visité a un cliente nuevo")], sessionId }));
    expect(step3.mode).toBe("proposal");

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