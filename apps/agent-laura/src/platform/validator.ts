import { getCapability } from "./capabilities.js";
import type { CapabilityAction, CapabilityDomain, PlannedAction, PlatformPlan } from "./types.js";

export type ValidatedPlatformAction = PlannedAction & { confidence?: number };

export interface PlatformPlanValidationResult {
  ok: boolean;
  intent: string;
  executableReads: ValidatedPlatformAction[];
  proposalWrites: ValidatedPlatformAction[];
  missingFields: string[];
  errors: string[];
  warnings: string[];
  clarificationQuestion?: string;
}

type PlanForValidation = Omit<PlatformPlan, "actions"> & {
  actions: Array<PlannedAction & { confidence?: number }>;
};

function hasRequiredValue(args: Record<string, unknown>, field: string): boolean {
  const value = args[field];
  if (value == null) {
    return false;
  }
  return typeof value !== "string" || value.trim().length > 0;
}

function cloneAction(action: PlannedAction & { confidence?: number }, requiredFields: string[], missingFields: string[], requiresConfirmation: boolean): ValidatedPlatformAction {
  return {
    ...action,
    arguments: { ...action.arguments },
    requiredFields: [...requiredFields],
    missingFields: [...missingFields],
    requiresConfirmation,
  };
}

function clarificationForMissing(fields: string[]): string {
  return `Para avanzar necesito estos datos: ${fields.join(", ")}. ¿Me los podés pasar?`;
}

export function validatePlatformPlan(plan: PlanForValidation): PlatformPlanValidationResult {
  const executableReads: ValidatedPlatformAction[] = [];
  const proposalWrites: ValidatedPlatformAction[] = [];
  const missingFields: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let clarificationQuestion: string | undefined;

  for (const action of plan.actions) {
    if (typeof action.confidence === "number" && action.confidence < 0.45) {
      errors.push(`La accion ${action.domain}.${action.action} tiene baja confianza.`);
      clarificationQuestion = "No estoy seguro de haber entendido. ¿Me podés aclarar qué querés hacer?";
      continue;
    }

    const capability = getCapability(action.domain as CapabilityDomain, action.action as CapabilityAction);
    if (!capability) {
      errors.push(`La accion ${action.domain}.${action.action} no está disponible en Laura.`);
      continue;
    }

    const requiredFields = capability.requiredFields ? [...capability.requiredFields] : [];
    const actionMissingFields = requiredFields.filter((field) => !hasRequiredValue(action.arguments, field));
    if (actionMissingFields.length > 0) {
      missingFields.push(...actionMissingFields);
      clarificationQuestion = clarificationForMissing(actionMissingFields);
      continue;
    }

    const normalizedAction = cloneAction(
      action,
      requiredFields,
      [],
      capability.requiresConfirmation ?? false,
    );

    if (capability.kind === "read") {
      executableReads.push(normalizedAction);
    } else {
      proposalWrites.push(normalizedAction);
    }
  }

  return {
    ok: errors.length === 0 && missingFields.length === 0,
    intent: plan.intent,
    executableReads,
    proposalWrites,
    missingFields,
    errors,
    warnings,
    clarificationQuestion,
  };
}
