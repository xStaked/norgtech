import type { LauraStateType } from "./state.js";

export function routerEdge(state: LauraStateType): string {
  switch (state.mode) {
    case "greeting":
      return "greeting";
    case "agenda":
      return "agenda";
    case "clarification":
      return "clarify";
    case "proposal":
      return "extract_intent";
    default:
      return "extract_intent";
  }
}

export function afterConfirmationEdge(state: LauraStateType): string {
  switch (state.proposalStatus) {
    case "confirmed":
      return "confirm";
    case "discarded":
      return "discard";
    case "draft":
    default:
      return "refine";
  }
}