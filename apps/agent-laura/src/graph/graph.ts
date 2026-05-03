import { StateGraph, START, END } from "@langchain/langgraph";
import { LauraState } from "./state.js";
import { routerNode } from "./nodes/router.js";
import { greetingNode } from "./nodes/greeting.js";
import { clarifyNode } from "./nodes/clarify.js";
import { extractIntentNode } from "./nodes/extract-intent.js";
import { buildProposalNode } from "./nodes/build-proposal.js";
import { awaitConfirmationNode } from "./nodes/await-confirmation.js";
import { refineNode } from "./nodes/refine.js";
import { confirmNode } from "./nodes/confirm.js";
import { discardNode } from "./nodes/discard.js";
import { agendaNode } from "./nodes/agenda.js";
import { routerEdge, afterConfirmationEdge } from "./edges.js";

const graphBuilder = new StateGraph(LauraState)
  .addNode("router", routerNode)
  .addNode("greeting", greetingNode)
  .addNode("clarify", clarifyNode)
  .addNode("extract_intent", extractIntentNode)
  .addNode("build_proposal", buildProposalNode)
  .addNode("await_confirmation", awaitConfirmationNode)
  .addNode("refine", refineNode)
  .addNode("confirm", confirmNode)
  .addNode("discard", discardNode)
  .addNode("agenda", agendaNode);

graphBuilder
  .addEdge(START, "router")
  .addConditionalEdges("router", routerEdge, {
    greeting: "greeting",
    agenda: "agenda",
    clarify: "clarify",
    extract_intent: "extract_intent",
  })
  .addEdge("greeting", END)
  .addEdge("clarify", END)
  .addEdge("agenda", END)
  .addEdge("extract_intent", "build_proposal")
  .addEdge("build_proposal", "await_confirmation")
  .addConditionalEdges("await_confirmation", afterConfirmationEdge, {
    confirm: "confirm",
    discard: "discard",
    refine: "refine",
  })
  .addEdge("refine", "build_proposal")
  .addEdge("confirm", END)
  .addEdge("discard", END);

export function createLauraGraph() {
  return graphBuilder.compile();
}