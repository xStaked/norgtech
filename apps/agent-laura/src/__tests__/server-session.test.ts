import { describe, expect, it, vi } from "vitest";

const { mockCreateLauraGraph, mockGetCheckpointer } = vi.hoisted(() => ({
  mockCreateLauraGraph: vi.fn(),
  mockGetCheckpointer: vi.fn().mockResolvedValue({}),
}));

vi.mock("../checkpointer.js", () => ({
  getCheckpointer: mockGetCheckpointer,
  closeCheckpointer: vi.fn(),
  isPostgresCheckpointer: vi.fn().mockReturnValue(false),
}));

vi.mock("../graph/graph.js", () => ({
  createLauraGraph: mockCreateLauraGraph,
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

import { handleInvoke } from "../server.js";

describe("server session continuity", () => {
  it("uses the generated graph thread id as the first response sessionId", async () => {
    let threadId = "";
    let initialStateSessionId = "";

    mockCreateLauraGraph.mockReturnValueOnce({
      getState: vi.fn().mockResolvedValue({ values: {} }),
      invoke: vi.fn().mockImplementation(async (input, config) => {
        threadId = config.configurable.thread_id;
        initialStateSessionId = input.sessionId;

        return {
          ...input,
          mode: "greeting",
          messages: input.messages,
        };
      }),
    });

    const response = await handleInvoke("user-1", "", "hola");

    expect(threadId).toBeTruthy();
    expect(initialStateSessionId).toBe(threadId);
    expect(response.sessionId).toBe(threadId);
  });

  it("reuses the provided session id for follow-up commercial turns and preserves the proposal payload", async () => {
    let threadId = "";
    let invokeInput: Record<string, unknown> | undefined;

    mockCreateLauraGraph.mockReturnValueOnce({
      getState: vi.fn().mockResolvedValue({ values: { messages: [{ id: "prior-ai" }] } }),
      invoke: vi.fn().mockImplementation(async (input, config) => {
        threadId = config.configurable.thread_id;
        invokeInput = input as Record<string, unknown>;

        return {
          sessionId: config.configurable.thread_id,
          mode: "proposal",
          messages: input.messages,
          proposalId: "prop-commercial-1",
          proposalStatus: "draft",
          proposal: {
            blocks: {
              visit: {
                enabled: true,
                action: "update",
                id: "visit-1",
                scheduledAt: "2026-05-20T14:00:00.000Z",
              },
              followUp: {
                enabled: true,
                action: "update",
                id: "followup-1",
                dueAt: "2026-05-20T17:00:00.000Z",
                relatedTo: "visit-1",
              },
            },
            summary: {
              primaryCount: 1,
              relatedCount: 1,
              primaryActions: ["visits.update"],
              relatedActions: ["followups.update"],
              relatedToIds: ["visit-1"],
              labels: ["Reprogramar visita", "Mover seguimiento relacionado"],
            },
          },
        };
      }),
    });

    const response = await handleInvoke(
      "user-1",
      "session-commercial-9",
      "reprograma la visita del jueves y mové también el seguimiento",
    );

    expect(threadId).toBe("session-commercial-9");
    expect(invokeInput).not.toHaveProperty("sessionId");
    expect(response.sessionId).toBe("session-commercial-9");
    expect(response.mode).toBe("proposal");
    if (response.mode !== "proposal") {
      throw new Error("expected proposal response");
    }
    expect(response.proposalId).toBe("prop-commercial-1");
    expect(response.proposal.summary).toMatchObject({
      primaryCount: 1,
      relatedCount: 1,
      relatedToIds: ["visit-1"],
    });
    expect(response.proposal.blocks.followUp).toMatchObject({
      relatedTo: "visit-1",
      id: "followup-1",
    });
  });
});
