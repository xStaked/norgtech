import { StateGraph, START, END } from "@langchain/langgraph";
import { LauraState } from "./state.js";
import { routerNode } from "./nodes/router.js";
import { greetingNode } from "./nodes/greeting.js";
import { clarifyNode } from "./nodes/clarify.js";
import { extractIntentNode } from "./nodes/extract-intent.js";
import { buildProposalNode } from "./nodes/build-proposal.js";
import { refineNode } from "./nodes/refine.js";
import { confirmNode } from "./nodes/confirm.js";
import { discardNode } from "./nodes/discard.js";
import { agendaNode } from "./nodes/agenda.js";
import { qaNode } from "./nodes/qa.js";
import { queryNode } from "./nodes/query.js";
import { modifyNode } from "./nodes/modify.js";
import { platformNode } from "./nodes/platform.js";
import { routerEdge } from "./edges.js";

const graphBuilder = new StateGraph(LauraState)
  .addNode("router", routerNode)
  .addNode("greeting", greetingNode)
  .addNode("clarify", clarifyNode)
  .addNode("extract_intent", extractIntentNode)
  .addNode("build_proposal", buildProposalNode)
  .addNode("refine", refineNode)
  .addNode("confirm", confirmNode)
  .addNode("discard", discardNode)
  .addNode("agenda", agendaNode)
  .addNode("qa", qaNode)
  .addNode("query", queryNode)
  .addNode("modify", modifyNode)
  .addNode("platform", platformNode);

graphBuilder
  .addEdge(START, "router")
  .addConditionalEdges("router", routerEdge, {
    greeting: "greeting",
    agenda: "agenda",
    clarify: "clarify",
    confirm: "confirm",
    discard: "discard",
    refine: "refine",
    extract_intent: "extract_intent",
    qa: "qa",
    query: "query",
    modify: "modify",
    platform: "platform",
  })
  .addEdge("greeting", END)
  .addEdge("clarify", END)
  .addEdge("agenda", END)
  .addEdge("qa", END)
  .addEdge("query", END)
  .addEdge("modify", END)
  .addEdge("platform", END)
  .addEdge("extract_intent", "build_proposal")
  .addEdge("build_proposal", END)
  .addEdge("refine", END)
  .addEdge("confirm", END)
  .addEdge("discard", END);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLauraGraph(checkpointer?: any) {
  return graphBuilder.compile(checkpointer ? { checkpointer } : undefined);
}
