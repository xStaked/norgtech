import type { LauraState } from "../state.js";

export async function routerNode(state: LauraState): Promise<Partial<LauraState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = typeof lastMessage.content === "string"
    ? lastMessage.content
    : Array.isArray(lastMessage.content)
      ? lastMessage.content.map((c: unknown) => (typeof c === "string" ? c : "")).join(" ")
      : "";

  const classification = classifyWithHeuristics(content, state);

  return { mode: classification };
}

function classifyWithHeuristics(
  content: string,
  state: LauraState,
): "clarification" | "confirm" | "discard" | "refine" | "platform" {
  const normalized = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[!?.]+$/, "");

  const hasActiveProposal = state.proposalStatus === "draft" && state.proposal !== null;

  if (hasActiveProposal) {
    const discardPatterns = [
      "cancelar", "cancela", "descartar", "descarta", "no guardar",
      "no lo guardes", "borrar", "borra", "eliminar", "elimina",
    ];
    if (discardPatterns.some((p) => normalized.includes(p))) {
      return "discard";
    }

    const confirmPatterns = [
      "confirmo", "confirmar", "si confirmo", "si, confirmo",
      "sí confirmo", "sí, confirmo", "guarda", "guardalo", "guardá",
      "guardalo todo", "ok guardalo", "dale guardalo",
    ];
    if (confirmPatterns.some((p) => normalized === p || normalized.includes(p))) {
      return "confirm";
    }

    const refinePatterns = [
      "cambia", "cambiar", "modifica", "modificar", "ajusta", "ajustar",
      "editar", "edita", "no quiero", "quitale", "quítale", "agrega",
      "agregale", "anade", "anadele", "añade", "añadele", "pone", "poné", "ponle", "mejor", "en vez de",
    ];
    if (refinePatterns.some((p) => normalized.includes(p))) {
      return "refine";
    }

    if (containsContactDetail(content, normalized)) {
      return "refine";
    }
  }

  const hasActiveClarification = state.clarificationOptions !== null
    && state.clarificationOptions.options.length > 0;

  if (hasActiveClarification && isClarificationReply(normalized)) {
    return "clarification";
  }

  if (hasActiveProposal) {
    return "refine";
  }

  return "platform";
}

function containsContactDetail(content: string, normalized: string): boolean {
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(content);
  const hasPhoneHint = /\b(telefono|tel|celular|numero|whatsapp|wpp)\b/.test(normalized)
    && /\d{7,}/.test(normalized.replace(/\D/g, ""));

  return hasEmail || hasPhoneHint;
}

function isClarificationReply(normalized: string): boolean {
  const clarificationPatterns = ["el primero", "la primera", "primer", "segundo", "segunda", "tercer", "tercera", "opcion 1", "opcion 2", "opcion 3", "opción 1", "opción 2", "opción 3"];
  const shortResponses = ["si", "sí", "ok", "dale", "correcto", "confirmo"];

  if (clarificationPatterns.some((p) => normalized.includes(p))) {
    return true;
  }

  if (shortResponses.includes(normalized) || /^[1-3]$/.test(normalized)) {
    return true;
  }

  return false;
}
