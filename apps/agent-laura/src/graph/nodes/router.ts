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
): "greeting" | "agenda" | "clarification" | "proposal" | "confirm" | "discard" | "refine" | "qa" {
  const normalized = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[!?.]+$/, "");

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

  const wordCount = normalized.split(/\s+/).length;

  if (wordCount <= 8) {
    const greetingPatterns = [
      "hola", "buenos dias", "buenas tardes", "buenas noches",
      "hey", "hi", "que tal", "como estas", "como andas",
      "como va", "como te va", "como andas", "todo bien",
      "todo liso", "que onda", "que haces", "que me cuentas",
    ];
    if (greetingPatterns.some((g) => normalized === g || normalized.startsWith(`${g} `) || normalized.endsWith(g))) {
      return "greeting";
    }
  }

  if (isClarificationReply(normalized)) {
    return "clarification";
  }

  const hasAgendaContext = state.agendaItems !== null && state.agendaItems.length > 0;

  if (hasAgendaContext && isFollowUpQuestion(normalized)) {
    return "qa";
  }

  if (isQAQuestion(normalized)) {
    return "qa";
  }

  const agendaKeywords = ["agenda", "pendientes", "pendiente", "tareas", "visitas", "semana", "hoy", "que tengo", "qué tengo", "programado"];
  if (agendaKeywords.some((k) => normalized.includes(k))) {
    return "agenda";
  }

  return "proposal";
}

function isFollowUpQuestion(normalized: string): boolean {
  const followUpPatterns = [
    "esa llamada", "ese pendiente", "esa tarea", "esa visita",
    "ese cliente", "esa empresa", "ese contacto",
    "a que hora", "a qué hora", "cuando es", "cuándo es",
    "de que se trata", "de qué se trata",
    "el primero", "la primera", "el segundo", "la segunda",
    "ese", "esa", "aquel",
  ];
  return followUpPatterns.some((p) => normalized.includes(p));
}

function isQAQuestion(normalized: string): boolean {
  const qaPatterns = [
    "que hora", "que empresa", "a que empresa", "a qué empresa",
    "cuando", "cuándo", "cuantos", "cuántos", "cuanto", "cuánto",
    "cual es", "cuál es", "quien es", "quién es",
    "donde", "dónde", "pertenece", "telefono de", "teléfono de",
    "email de", "correo de", "contacto de",
    "a quien", "a quién", "de quien", "de quién",
    "que cliente", "qué cliente", "que contacto", "qué contacto",
    "cuales son", "cuáles son", "listame", "listáme",
  ];
  return qaPatterns.some((p) => normalized.includes(p));
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