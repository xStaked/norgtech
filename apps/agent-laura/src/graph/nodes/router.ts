import type { LauraStateType } from "../state.js";

export async function routerNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
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
  state: LauraStateType,
): "greeting" | "agenda" | "clarification" | "proposal" | "confirm" | "discard" | "refine" {
  const normalized = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

  const hasActiveProposal = state.proposalStatus === "draft" && state.proposal !== null;

  if (hasActiveProposal) {
    const confirmPatterns = [
      "confirmo", "confirmar", "si confirmo", "si, confirmo",
      "sí confirmo", "sí, confirmo", "guarda", "guardalo", "guardá",
      "guardalo todo", "ok guardalo", "dale guardalo",
    ];
    if (confirmPatterns.some((p) => normalized === p || normalized.includes(p))) {
      return "confirm";
    }

    const discardPatterns = [
      "cancelar", "cancela", "descartar", "descarta", "no guardar",
      "no lo guardes", "borrar", "borra", "eliminar", "elimina",
    ];
    if (discardPatterns.some((p) => normalized.includes(p))) {
      return "discard";
    }

    const refinePatterns = [
      "cambia", "cambiar", "modifica", "modificar", "ajusta", "ajustar",
      "editar", "edita", "no quiero", "quitale", "quítale", "agrega",
      "agregale", "pone", "poné", "ponle", "mejor", "en vez de",
    ];
    if (refinePatterns.some((p) => normalized.includes(p))) {
      return "refine";
    }
  }

  const agendaKeywords = ["agenda", "pendientes", "pendiente", "tareas", "visitas", "semana", "hoy", "que tengo", "qué tengo", "programado"];
  if (agendaKeywords.some((k) => normalized.includes(k))) {
    return "agenda";
  }

  if (normalized.split(/\s+/).length <= 6) {
    const greetingPatterns = ["hola", "buenos dias", "buenas tardes", "buenas noches", "hey", "hi", "que tal", "qué tal"];
    if (greetingPatterns.some((g) => normalized === g || normalized.startsWith(`${g} `))) {
      return "greeting";
    }
  }

  if (isClarificationReply(normalized)) {
    return "clarification";
  }

  return "proposal";
}

function isClarificationReply(normalized: string): boolean {
  const clarificationPatterns = ["el primero", "la primera", "primer", "segundo", "segunda", "tercer", "tercera", "opcion 1", "opcion 2", "opcion 3", "opción 1", "opción 2", "opción 3"];
  const shortResponses = ["si", "sí", "ok", "dale", "correcto", "confirmo"];

  if (clarificationPatterns.some((p) => normalized.includes(p))) {
    return true;
  }

  if (shortResponses.includes(normalized)) {
    return true;
  }

  return false;
}