import type { LauraStateType } from "../state.js";

export async function routerNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = typeof lastMessage.content === "string"
    ? lastMessage.content
    : Array.isArray(lastMessage.content)
      ? lastMessage.content.map((c) => (typeof c === "string" ? c : ("text" in c ? c.text : ""))).join(" ")
      : "";

  const classification = classifyWithHeuristics(content);

  return { mode: classification };
}

function classifyWithHeuristics(content: string): "greeting" | "agenda" | "clarification" | "proposal" {
  const normalized = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

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