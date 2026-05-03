import { createLauraGraph } from "./graph/graph.js";
import { config } from "./config/index.js";
import { getCheckpointer, closeCheckpointer, isPostgresCheckpointer } from "./checkpointer.js";
import type { AgentResponse } from "./types.js";
import type { LauraStateType } from "./graph/state.js";
import { HumanMessage } from "@langchain/core/messages";

function stateToResponse(state: LauraStateType): AgentResponse {
  const lastMessage = state.messages[state.messages.length - 1];
  const message = lastMessage
    ? (typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content))
    : "";

  const base: AgentResponse = {
    mode: state.mode,
    sessionId: state.sessionId,
    message,
  };

  if (state.mode === "clarification" && state.clarificationOptions) {
    base.clarification = {
      type: state.clarificationOptions.type as "customer" | "opportunity" | "date" | "action",
      options: state.clarificationOptions.options,
    };
  }

  if (state.mode === "proposal" && state.proposal) {
    base.proposalId = state.proposalId ?? undefined;
    base.proposal = state.proposal;
  }

  if (state.mode === "agenda" && state.agendaItems) {
    base.agenda = { items: state.agendaItems };
  }

  return base;
}

export async function handleInvoke(
  userId: string,
  sessionId: string,
  content: string,
  contextType?: string,
  contextEntityId?: string,
): Promise<AgentResponse> {
  const checkpointer = await getCheckpointer();
  const graph = createLauraGraph(checkpointer);

  const threadConfig = {
    configurable: { thread_id: sessionId || crypto.randomUUID() },
  };

  const currentState = await graph.getState(threadConfig);
  const isNewThread = currentState.values.messages === undefined || currentState.values.messages.length === 0;

  const input = isNewThread
    ? {
        sessionId: sessionId || threadConfig.configurable.thread_id,
        userId,
        messages: [new HumanMessage(content)],
        mode: "greeting" as const,
        customerContext: contextType === "customer" && contextEntityId ? { id: contextEntityId, label: "" } : null,
        opportunityContext: contextType === "opportunity" && contextEntityId ? { id: contextEntityId, label: "" } : null,
        clarificationOptions: null,
        proposal: null,
        proposalId: null,
        proposalStatus: "draft" as const,
        agendaItems: null,
        lastError: null,
        _extractionResult: null,
      }
    : {
        messages: [new HumanMessage(content)],
      };

  const result = await graph.invoke(input, threadConfig);

  return stateToResponse(result);
}

async function startServer() {
  const { createServer } = await import("http");

  await getCheckpointer();

  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/invoke") {
      try {
        const body = await new Promise<string>((resolve) => {
          let data = "";
          req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
          req.on("end", () => resolve(data));
        });

        const { userId, sessionId, content, contextType, contextEntityId } = JSON.parse(body);
        const response = await handleInvoke(userId, sessionId ?? "", content, contextType, contextEntityId);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Internal server error";
        console.error("Error handling /invoke:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
    } else if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", checkpointer: isPostgresCheckpointer() ? "postgres" : "memory" }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  server.listen(config.port, () => {
    console.log(`Laura Agent Service running on port ${config.port}`);
  });

  const shutdown = async () => {
    console.log("\nShutting down...");
    await closeCheckpointer();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { startServer };