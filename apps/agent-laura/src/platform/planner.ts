import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createLlm } from "../config/providers.js";
import { LAURA_SYSTEM_PROMPT } from "../prompts/system-prompt.js";
import { capabilitiesForPrompt, getCapability } from "./capabilities.js";
import type { LauraPlatformContext } from "./context.js";
import type { CapabilityAction, CapabilityDomain, PlannedAction, PlatformPlan } from "./types.js";

const domainSchema = z.enum([
  "customers",
  "contacts",
  "opportunities",
  "visits",
  "followups",
  "quotes",
  "orders",
  "products",
  "segments",
  "reports",
  "dashboard",
]);

const actionSchema = z.enum([
  "search",
  "detail",
  "create",
  "update",
  "cancel",
  "complete",
  "change_status",
  "add_item",
  "bulk_delete",
]);

const intentSchema = z.enum([
  "read",
  "write",
  "mixed",
  "clarification",
  "greeting",
  "help",
  "unsupported",
]);

const kindSchema = z.enum(["read", "write"]);
const roleSchema = z.enum(["primary", "related"]);

const plannedActionSchema = z
  .object({
    domain: domainSchema,
    action: actionSchema,
    kind: kindSchema.optional(),
    toolName: z.string().optional(),
    arguments: z.record(z.unknown()).optional(),
    fields: z.record(z.unknown()).optional(),
    confidence: z.number().min(0).max(1).optional(),
    role: roleSchema.optional(),
    relatedTo: z.string().optional(),
    entityRef: z.string().optional(),
    humanSummary: z.string().optional(),
  })
  .strict();

const platformPlanSchema = z
  .object({
    intent: intentSchema,
    summary: z.string(),
    actions: z.array(plannedActionSchema),
    requiresConfirmation: z.boolean().default(false),
    clarificationQuestion: z.string().optional(),
    missingFields: z.array(z.string()).default([]),
    ambiguity: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).optional(),
    responseStyle: z.enum(["brief", "adaptive"]).optional(),
  })
  .strict();

type ParsedAction = z.infer<typeof plannedActionSchema>;

export type PlannerAction = PlannedAction & { confidence?: number };
export type PlannerPlatformPlan = Omit<PlatformPlan, "actions"> & { actions: PlannerAction[] };

function clarificationFallback(): PlannerPlatformPlan {
  return {
    intent: "clarification",
    summary: "No pude interpretar la solicitud como JSON valido.",
    actions: [],
    requiresConfirmation: false,
    missingFields: [],
    ambiguity: [],
    clarificationQuestion: "No pude entender bien el pedido. ¿Me lo podés repetir con un poco más de detalle?",
  };
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function stringifyLlmContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function normalizeAction(action: ParsedAction): PlannerAction {
  const normalizedArguments = {
    ...(action.fields ?? {}),
    ...(action.arguments ?? {}),
  };
  const capability = getCapability(action.domain as CapabilityDomain, action.action as CapabilityAction);
  if (!capability) {
    return {
      domain: action.domain as CapabilityDomain,
      action: action.action as CapabilityAction,
      toolName: action.toolName ?? "",
      arguments: normalizedArguments,
      requiredFields: [],
      missingFields: [],
      requiresConfirmation: true,
      confidence: action.confidence,
      role: action.role,
      relatedTo: action.relatedTo,
      entityRef: action.entityRef,
      humanSummary: action.humanSummary,
    };
  }

  const requiredFields = capability?.requiredFields ? [...capability.requiredFields] : [];

  return {
    domain: action.domain as CapabilityDomain,
    action: action.action as CapabilityAction,
    toolName: action.toolName ?? capability.toolName,
    arguments: normalizedArguments,
    requiredFields,
    missingFields: [],
    requiresConfirmation: capability.requiresConfirmation ?? false,
    confidence: action.confidence,
    role: action.role,
    relatedTo: action.relatedTo,
    entityRef: action.entityRef,
    humanSummary: action.humanSummary,
  };
}

function compactContext(context: LauraPlatformContext): string {
  return JSON.stringify({
    userId: context.userId,
    sessionId: context.sessionId,
    customerContext: context.customerContext,
    opportunityContext: context.opportunityContext,
    mentionedEntities: context.mentionedEntities,
    currentMessage: context.currentMessage,
    recentMessages: context.recentMessages,
    agendaSummary: context.agendaSummary,
    activeProposal: context.activeProposal,
    activeProposalSummary: context.activeProposalSummary,
    relatedEntities: context.relatedEntities,
  });
}

export async function planPlatformIntent(context: LauraPlatformContext): Promise<PlannerPlatformPlan> {
  const llm = createLlm();
  const response = await llm.invoke([
    new SystemMessage(`${LAURA_SYSTEM_PROMPT}

Capacidades disponibles:
${capabilitiesForPrompt()}

Devolvé solo JSON estricto con esta forma:
{"intent":"read|write|mixed|clarification|greeting|help|unsupported","summary":"...","actions":[{"domain":"customers","action":"search","kind":"read","fields":{},"role":"primary","relatedTo":"action-1","confidence":0.9,"entityRef":"customer-1","humanSummary":"Buscar cliente"}],"requiresConfirmation":false,"missingFields":[],"ambiguity":[],"clarificationQuestion":"...","confidence":0.9,"responseStyle":"brief|adaptive"}

Reglas de planificación:
- Priorizá un plan balanceado entre quotes, orders, followups y visits; no sesgues agenda por encima de operaciones comerciales si el pedido mezcla ambas.
- Si hay ambigüedad o falta información para escribir, devolvé la intención correspondiente con \`missingFields\`, \`ambiguity\` y \`clarificationQuestion\` antes de preparar propuestas.
- Cada action puede usar \`fields\` como payload principal; si necesitás compatibilidad, \`arguments\` también es válido.
- Marcá \`kind\`, \`role\` (\`primary\` o \`related\`) y \`relatedTo\` cuando una acción dependa de otra.
- Incluí \`confidence\` a nivel plan y acción, y \`responseStyle\` (\`brief\` o \`adaptive\`) cuando aporte a la respuesta.
- No ejecutes herramientas.`),
    new HumanMessage(`Contexto compacto:\n${compactContext(context)}\n\nPlanificá la intención sin ejecutar herramientas.`),
  ]);

  try {
    const content = stringifyLlmContent(response.content);
    const parsed = platformPlanSchema.parse(JSON.parse(stripJsonFence(content)));
    return {
      intent: parsed.intent,
      summary: parsed.summary,
      actions: parsed.actions.map(normalizeAction),
      requiresConfirmation: parsed.requiresConfirmation,
      missingFields: parsed.missingFields,
      ambiguity: parsed.ambiguity,
      clarificationQuestion: parsed.clarificationQuestion,
      confidence: parsed.confidence,
      responseStyle: parsed.responseStyle,
    };
  } catch {
    return clarificationFallback();
  }
}
