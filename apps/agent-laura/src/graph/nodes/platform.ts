import { AIMessage } from "@langchain/core/messages";
import type { LauraState } from "../state.js";
import { buildPlatformContext } from "../../platform/context.js";
import { planPlatformIntent } from "../../platform/planner.js";
import { validatePlatformPlan } from "../../platform/validator.js";
import { executeReadActions } from "../../platform/read-executor.js";
import { buildProposalFromActions } from "../../platform/proposal-builder.js";

function appendMessage(state: LauraState, message: string): AIMessage[] {
  return [...state.messages, new AIMessage(message)];
}

function hasProposalBlocks(proposal: NonNullable<LauraState["proposal"]>): boolean {
  return Object.keys(proposal.blocks).length > 0;
}

function platformHelpMessage(): string {
  return [
    "Puedo ayudarte a consultar clientes, contactos, oportunidades, visitas, seguimientos, cotizaciones, pedidos, productos, segmentos y dashboard.",
    "Tambien puedo preparar altas, cambios, cancelaciones o avances en esas entidades.",
    "Las consultas se responden directo; cualquier escritura queda como propuesta y solo se guarda cuando la confirmes.",
  ].join(" ");
}

export async function platformNode(state: LauraState): Promise<Partial<LauraState>> {
  const context = buildPlatformContext(state);
  const plan = await planPlatformIntent(context);

  if (plan.intent === "greeting") {
    return {
      mode: "greeting",
      messages: appendMessage(state, plan.summary || "Hola, soy Laura. Decime que necesitás hacer en el CRM."),
    };
  }

  if (plan.intent === "help") {
    return {
      mode: "qa",
      messages: appendMessage(state, plan.summary || platformHelpMessage()),
    };
  }

  if (plan.intent === "unsupported") {
    return {
      mode: "qa",
      messages: appendMessage(state, plan.summary || "Esa accion no está disponible en Laura por ahora."),
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
      messages: appendMessage(state, message),
    };
  }

  if (validation.proposalWrites.length === 0) {
    const data = await executeReadActions(state.userId, validation.executableReads);
    return {
      mode: "query",
      data,
      messages: appendMessage(state, data.summary),
    };
  }

  const proposal = buildProposalFromActions(validation.proposalWrites);
  if (!hasProposalBlocks(proposal)) {
    return {
      mode: "clarification",
      lastError: "No se pudo preparar una propuesta con las acciones planificadas.",
      messages: appendMessage(state, "No pude preparar una propuesta valida con esos datos. ¿Me das un poco mas de detalle?"),
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
    messages: appendMessage(state, `Preparé una propuesta para que la revises antes de guardar.${relatedInfo}`),
  };
}
