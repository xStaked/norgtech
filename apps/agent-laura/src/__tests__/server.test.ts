import { describe, it, expect, vi } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    port: 3100,
    nestjsBaseUrl: "http://localhost:3001",
    nestjsServiceToken: "test-token",
    databaseUrl: "",
    llm: { provider: "deepseek", model: "deepseek-chat", timeoutMs: 30000 },
  },
}));

vi.mock("../checkpointer.js", () => ({
  getCheckpointer: vi.fn().mockResolvedValue(undefined),
  closeCheckpointer: vi.fn(),
  isPostgresCheckpointer: vi.fn().mockReturnValue(false),
}));

vi.mock("../tools/nestjs-client.js", () => ({
  searchCustomers: vi.fn().mockResolvedValue([
    { id: "customer-1", label: "Acme Piscicola" },
    { id: "customer-2", label: "Acme Trading" },
  ]),
  searchOpportunities: vi.fn().mockResolvedValue([
    { id: "opp-1", label: "Sistema de inventario" },
  ]),
  getCustomerDetails: vi.fn().mockResolvedValue({ id: "customer-1", displayName: "Acme Piscicola" }),
  getOpportunityDetails: vi.fn().mockResolvedValue({ id: "opp-1", title: "Sistema de inventario" }),
  getPendingTasks: vi.fn().mockResolvedValue([
    { id: "task-1", title: "Llamar a cliente", dueAt: "2026-05-10T10:00:00.000Z", type: "llamada" },
  ]),
  getScheduledVisits: vi.fn().mockResolvedValue([
    { id: "visit-1", summary: "Visita técnica", scheduledAt: "2026-05-11T15:00:00.000Z" },
  ]),
  createInteraction: vi.fn().mockResolvedValue({ id: "interaction-1" }),
  upsertOpportunity: vi.fn().mockResolvedValue({ id: "opp-created-1" }),
  createFollowUp: vi.fn().mockResolvedValue({ id: "followup-1" }),
  createTask: vi.fn().mockResolvedValue({ id: "task-created-1" }),
}));

vi.mock("../config/providers.js", () => ({
  createLlm: vi.fn().mockReturnValue({
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

import { createLauraGraph } from "../graph/graph.js";

describe("graph compilation", () => {
  it("compiles the Laura graph without checkpointer", () => {
    const graph = createLauraGraph();
    expect(graph).toBeDefined();
  });

  it("compiles the Laura graph with undefined checkpointer", () => {
    const graph = createLauraGraph(undefined);
    expect(graph).toBeDefined();
  });
});