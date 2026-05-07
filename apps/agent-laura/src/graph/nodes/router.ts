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
): "greeting" | "agenda" | "clarification" | "proposal" | "confirm" | "discard" | "refine" | "qa" | "platform" {
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

  const hasActiveClarification = state.clarificationOptions !== null
    && state.clarificationOptions.options.length > 0;

  if (hasActiveClarification && isClarificationReply(normalized)) {
    return "clarification";
  }

  if (isDirectAgendaRequest(normalized)) {
    return "agenda";
  }

  const hasAgendaContext = state.agendaItems !== null && state.agendaItems.length > 0;

  if (hasAgendaContext && isFollowUpQuestion(normalized)) {
    return "qa";
  }

  if (isCapabilityQuestion(normalized)) {
    return "platform";
  }

  return "platform";
}

function isDirectAgendaRequest(normalized: string): boolean {
  if (normalized.includes("equipo")) {
    return false;
  }

  const exactAgendaPatterns = [
    "agenda",
    "pendientes",
    "pendiente",
    "mis pendientes",
    "tareas pendientes",
  ];
  if (exactAgendaPatterns.includes(normalized)) {
    return true;
  }

  const agendaPatterns = [
    "mi agenda",
    "que tengo pendiente",
    "que tengo hoy",
    "que tengo que hacer hoy",
    "que tengo programado",
    "visitas programadas",
    "visitas tenemos programadas",
  ];

  return agendaPatterns.some((k) => normalized.includes(k));
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

function isCapabilityQuestion(normalized: string): boolean {
  const capabilityPatterns = [
    "que podes hacer", "que puedes hacer", "que sabes hacer",
    "que mas podes", "que mas puedes", "como me podes ayudar",
    "como me puedes ayudar", "como ayudas", "que funcionalidades",
    "para que servis", "para que sirves", "que haces",
    "en que me podes ayudar", "en que me puedes ayudar",
    "cuales son tus capacidades", "que mas haces",
    "explicame que podes", "decime que podes",
  ];
  return capabilityPatterns.some((p) => normalized.includes(p));
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
