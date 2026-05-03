import type { LauraStateType } from "./state.js";

export function routerEdge(state: LauraStateType): string {
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
    case "proposal":
      return "extract_intent";
    default:
      return "extract_intent";
  }
}