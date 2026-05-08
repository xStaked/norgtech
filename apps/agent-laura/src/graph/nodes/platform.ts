import { AIMessage } from "@langchain/core/messages";
import type { LauraState } from "../state.js";
import { buildPlatformContext } from "../../platform/context.js";
import { planPlatformIntent } from "../../platform/planner.js";
import { clarificationForMissing, validatePlatformPlan } from "../../platform/validator.js";
import { executeReadActions } from "../../platform/read-executor.js";
import { buildProposalFromActions } from "../../platform/proposal-builder.js";
import type { PlannerPlatformPlan } from "../../platform/planner.js";

function appendMessage(message: string): AIMessage[] {
  return [new AIMessage(message)];
}

function plannerNeedsClarification(plan: PlannerPlatformPlan): boolean {
  return (plan.ambiguity?.length ?? 0) > 0 || (plan.missingFields?.length ?? 0) > 0;
}

function hasProposalBlocks(proposal: NonNullable<LauraState["proposal"]>): boolean {
  return Object.values(proposal.blocks).some((block) => block.enabled);
}

function platformHelpMessage(): string {
  return [
    "Puedo ayudarte a consultar clientes, contactos, oportunidades, visitas, seguimientos, cotizaciones, pedidos, productos, segmentos y dashboard.",
    "Tambien puedo preparar altas, cambios, cancelaciones o avances en esas entidades.",
    "Las consultas se responden directo; cualquier escritura queda como propuesta y solo se guarda cuando la confirmes.",
  ].join(" ");
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isAffirmativeReply(message: string): boolean {
  const normalized = normalizeForMatch(message).trim();
  const patterns = [
    "si",
    "sí",
    "si dale",
    "dale",
    "que si",
    "obvio",
    "claro",
    "correcto",
    "yes",
  ];

  return patterns.includes(normalized);
}

function inferHelpTopic(messages: string[]): "opportunity" | "quote" | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeForMatch(messages[index]);
    if (normalized.includes("cotizacion")) {
      return "quote";
    }
    if (normalized.includes("oportunidad")) {
      return "opportunity";
    }
  }

  return null;
}

function directHelpMessage(topic: "opportunity" | "quote" | null): string {
  if (topic === "opportunity") {
    return [
      "Para crear una oportunidad necesito al menos el cliente, un título y la etapa inicial.",
      "También podés pasar valor estimado o fecha de cierre si ya los tenés.",
      "Por ejemplo: `creá una oportunidad para Acme llamada Renovación de aireadores en etapa contacto`.",
    ].join(" ");
  }

  if (topic === "quote") {
    return [
      "Para preparar una cotización necesito al menos el cliente.",
      "Si ya tenés más contexto, también sirven la oportunidad, vigencia, notas y los ítems con producto, cantidad y precio.",
      "Por ejemplo: `creá una cotización para Acme con 3 aireadores de $200000 cada uno`.",
    ].join(" ");
  }

  return platformHelpMessage();
}

function normalizeHelpMessage(summary: string | undefined, recentMessages: string[]): string {
  const trimmed = summary?.trim();
  const topic = inferHelpTopic(recentMessages);

  if (!trimmed) {
    return directHelpMessage(topic);
  }

  const normalized = normalizeForMatch(trimmed);
  const currentMessage = recentMessages.at(-1) ?? "";

  if (normalized.includes("queres que te explique") || normalized.includes("querés que te explique")) {
    return directHelpMessage(topic);
  }

  if (isAffirmativeReply(currentMessage)) {
    return directHelpMessage(topic);
  }

  return trimmed;
}

function normalizeGreetingMessage(summary?: string): string {
  const trimmed = summary?.trim();
  if (!trimmed) {
    return "Hola, soy Laura. Decime qué necesitás hacer en el CRM.";
  }

  const normalized = trimmed
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  if (normalized.includes("el usuario") || normalized.includes("saludando")) {
    return "Hola, soy Laura. Decime qué necesitás hacer en el CRM.";
  }

  return trimmed;
}

function inferCustomerNameFromMessage(message: string): string | undefined {
  const normalized = message.trim();
  const match = normalized.match(/(?:cliente|empresa|compania|compañia|compañía)\s+(?:nuevo\s+|nueva\s+)?(.+)$/i);
  const rawName = match?.[1]?.trim();
  if (!rawName) return undefined;

  return rawName
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hydratePlanFromMessage(plan: PlannerPlatformPlan, currentMessage: string): PlannerPlatformPlan {
  return {
    ...plan,
    actions: plan.actions.map((action) => {
      if (action.domain !== "customers" || action.action !== "create" || action.arguments.legalName) {
        return action;
      }

      const legalName = inferCustomerNameFromMessage(currentMessage);
      if (!legalName) return action;

      return {
        ...action,
        arguments: {
          ...action.arguments,
          legalName,
          displayName: typeof action.arguments.displayName === "string" ? action.arguments.displayName : legalName,
        },
      };
    }),
  };
}

function extractEmail(text: string): string | undefined {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractPhone(text: string): string | undefined {
  const withoutEmail = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ");
  const phoneCandidate = withoutEmail.match(/(?:\+?\d[\d\s().-]{6,}\d)/)?.[0];
  if (!phoneCandidate) return undefined;

  const normalized = phoneCandidate.replace(/[^\d+]/g, "");
  return normalized.replace(/^\+/, "").length >= 7 ? normalized : undefined;
}

function applyContactDetailsToActiveCustomer(
  proposal: LauraState["proposal"],
  currentMessage: string,
): LauraState["proposal"] {
  if (!proposal?.blocks.customer) return null;

  const email = extractEmail(currentMessage);
  const phone = extractPhone(currentMessage);
  if (!email && !phone) return null;

  return {
    ...proposal,
    blocks: {
      ...proposal.blocks,
      customer: {
        ...proposal.blocks.customer,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      },
    },
  };
}

export async function platformNode(state: LauraState): Promise<Partial<LauraState>> {
  const context = buildPlatformContext(state);
  const customerContactProposal = applyContactDetailsToActiveCustomer(context.activeProposal, context.currentMessage);
  if (customerContactProposal) {
    return {
      mode: "proposal",
      proposal: customerContactProposal,
      proposalId: state.proposalId ?? crypto.randomUUID(),
      proposalStatus: "draft",
      messages: appendMessage("Ajusté la propuesta según tu feedback. Revisala."),
    };
  }

  const plan = hydratePlanFromMessage(await planPlatformIntent(context), context.currentMessage);

  if (plan.intent === "greeting") {
    return {
      mode: "greeting",
      messages: appendMessage(normalizeGreetingMessage(plan.summary)),
    };
  }

  if (plan.intent === "help") {
    return {
      mode: "qa",
      messages: appendMessage(normalizeHelpMessage(plan.summary, context.recentMessages)),
    };
  }

  if (plan.intent === "unsupported") {
    return {
      mode: "qa",
      messages: appendMessage(plan.summary || "Esa accion no está disponible en Laura por ahora."),
    };
  }

  if (plan.intent === "clarification") {
    return {
      mode: "clarification",
      lastError: plan.summary || null,
      messages: appendMessage(
        plan.clarificationQuestion
          ?? plan.summary
          ?? "Necesito un poco mas de informacion para avanzar.",
      ),
    };
  }

  if (plannerNeedsClarification(plan)) {
    const details = [
      ...(plan.ambiguity ?? []),
      ...(plan.missingFields ?? []).map((field) => `Falta ${field}`),
    ];

    return {
      mode: "clarification",
      lastError: details.length > 0 ? details.join(" ") : plan.summary || null,
      messages: appendMessage(
        plan.clarificationQuestion
          ?? (plan.missingFields?.length
            ? clarificationForMissing(plan.missingFields)
            : "Necesito confirmar una referencia antes de preparar la propuesta."),
      ),
    };
  }

  const validation = validatePlatformPlan(plan);

  if (!validation.ok) {
    const details = [...validation.errors, ...validation.missingFields.map((field) => `Falta ${field}`)];
    const message = validation.clarificationQuestion
      ?? (details.length > 0 ? details.join(" ") : "Necesito un poco mas de informacion para avanzar.");

    return {
      mode: "clarification",
      lastError: details.length > 0 ? details.join(" ") : null,
      messages: appendMessage(message),
    };
  }

  if (validation.proposalWrites.length === 0) {
    const data = await executeReadActions(state.userId, validation.executableReads);
    return {
      mode: "query",
      data,
      messages: appendMessage(data.summary),
    };
  }

  const proposal = buildProposalFromActions(validation.proposalWrites);
  if (!hasProposalBlocks(proposal)) {
    return {
      mode: "clarification",
      lastError: "No se pudo preparar una propuesta con las acciones planificadas.",
      messages: appendMessage("No pude preparar una propuesta valida con esos datos. ¿Me das un poco mas de detalle?"),
    };
  }

  const relatedInfo = validation.executableReads.length > 0
    ? " Tambien detecté informacion relacionada para consultar, pero no ejecuté cambios."
    : "";

  return {
    mode: "proposal",
    proposal,
    proposalId: state.proposalId ?? crypto.randomUUID(),
    proposalStatus: "draft",
    messages: appendMessage(`Preparé una propuesta para que la revises antes de guardar.${relatedInfo}`),
  };
}
