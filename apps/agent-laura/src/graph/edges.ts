import type { LauraState } from "./state.js";

export function routerEdge(state: LauraState): string {
  switch (state.mode) {
    case "greeting":
      return "greeting";
    case "agenda":
      return "agenda";
    case "clarification":
      return "clarify";
    case "confirm":
      return "confirm";
    case "discard":
      return "discard";
    case "refine":
      return "refine";
    case "qa":
      return "qa";
    case "platform":
      return "platform";
    case "query":
      return "query";
    case "modify":
      return "modify";
    case "proposal":
      return "extract_intent";
    default:
      return "extract_intent";
  }
}
