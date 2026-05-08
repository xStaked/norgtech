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

const FIELD_LABELS: Record<string, string> = {
  customerId: "cliente",
  items: "items",
  pricing: "precios",
  conditions: "condiciones",
  status: "estado",
  dueAt: "fecha y hora",
  scheduledAt: "fecha y hora de la visita",
  type: "tipo de seguimiento",
  fullName: "nombre del contacto",
  legalName: "nombre del cliente",
  title: "titulo",
  stage: "etapa",
};

function hasRequiredValue(args: Record<string, unknown>, field: string): boolean {
  const value = args[field];
  if (value == null) {
    return false;
  }
  return typeof value !== "string" || value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasCompleteCommercialItems(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }

  return items.every((item) => (
    isRecord(item)
    && typeof item.productId === "string"
    && item.productId.trim().length > 0
    && hasPositiveNumber(item.quantity)
    && hasPositiveNumber(item.unitPrice)
  ));
}

function hasCommercialPricing(args: Record<string, unknown>): boolean {
  if (!hasRequiredValue(args, "pricing")) {
    return false;
  }

  return hasCompleteCommercialItems(args.items);
}

const FIELD_VALIDATORS: Partial<Record<string, (args: Record<string, unknown>) => boolean>> = {
  items: (args) => hasCompleteCommercialItems(args.items),
  pricing: (args) => hasCommercialPricing(args),
};

function missingFieldsForRequirements(args: Record<string, unknown>, requiredFields: string[]): string[] {
  return requiredFields.filter((field) => {
    const validator = FIELD_VALIDATORS[field];
    return validator ? !validator(args) : !hasRequiredValue(args, field);
  });
}

function isCommercialCreateAction(action: PlannedAction, requiredFields: string[]): boolean {
  return action.action === "create"
    && (action.domain === "quotes" || action.domain === "orders")
    && ["customerId", "items", "pricing", "conditions", "status"].every((field) => requiredFields.includes(field));
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

function humanizeField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function clarificationForMissing(fields: string[]): string {
  const labels = Array.from(new Set(fields.map(humanizeField)));
  return `Para avanzar necesito estos datos: ${labels.join(", ")}. ¿Me los podés pasar?`;
}

export function validatePlatformPlan(plan: PlanForValidation): PlatformPlanValidationResult {
  const executableReads: ValidatedPlatformAction[] = [];
  const proposalWrites: ValidatedPlatformAction[] = [];
  const missingFields: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let clarificationQuestion: string | undefined;

  if ((plan.ambiguity?.length ?? 0) > 0) {
    const prompt = plan.clarificationQuestion ?? "Necesito confirmar a cuál registro te referís.";
    return {
      ok: false,
      intent: plan.intent,
      executableReads,
      proposalWrites,
      missingFields: [],
      errors: ["ambiguous_reference"],
      warnings,
      clarificationQuestion: /visita/i.test(plan.summary) ? `${prompt} ¿Cuál visita querés usar?` : prompt,
    };
  }

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
    if (isCommercialCreateAction(action, requiredFields)) {
      const commercialMissing = missingFieldsForRequirements(action.arguments, requiredFields);
      if (commercialMissing.length > 0) {
        missingFields.push(...commercialMissing);
        errors.push("missing_commercial_fields");
        clarificationQuestion = clarificationForMissing(commercialMissing);
        continue;
      }
    }

    const actionMissingFields = missingFieldsForRequirements(action.arguments, requiredFields);
    if (actionMissingFields.length > 0) {
      missingFields.push(...actionMissingFields);
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
    clarificationQuestion: clarificationQuestion ?? (missingFields.length > 0 ? clarificationForMissing(missingFields) : undefined),
  };
}
