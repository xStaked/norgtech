import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { FollowUpTaskType, OpportunityStage } from "@prisma/client";
import { LAURA_SYSTEM_PROMPT } from "./prompts/laura-system-prompt";

export interface LauraExtractionResult {
  intent: "report" | "agenda_query";
  customerName?: string;
  contactName?: string;
  interactionSummary?: string;
  suggestedOpportunityTitle?: string;
  suggestedOpportunityStage?: OpportunityStage;
  suggestedNextStep?: string;
  suggestedFollowUpDate?: string;
  suggestedTaskTitle?: string;
  taskType?: FollowUpTaskType;
  signals?: { objections?: string[]; risk?: string; buyingIntent?: string };
}

export interface LauraExtractorProvider {
  extract(input: {
    message: string;
    contextSummary?: string;
    recentMessages: string[];
    systemPrompt: string;
  }): Promise<string>;
}

export const LAURA_EXTRACTOR_PROVIDER = Symbol("LAURA_EXTRACTOR_PROVIDER");

@Injectable()
export class DeterministicLauraExtractorProvider implements LauraExtractorProvider {
  async extract(input: {
    message: string;
    contextSummary?: string;
    recentMessages: string[];
    systemPrompt: string;
  }) {
    void input.contextSummary;
    void input.recentMessages;
    void input.systemPrompt;

    const normalized = normalize(input.message);
    const intent = isAgendaQuery(normalized) ? "agenda_query" : "report";
    const followUpDate = inferFollowUpDate(normalized);
    const stage = inferOpportunityStage(normalized);
    const taskType = normalized.includes("visita") ? FollowUpTaskType.reunion : FollowUpTaskType.llamada;
    const objections = extractObjections(input.message);

    return JSON.stringify({
      intent,
      interactionSummary: input.message.trim(),
      suggestedOpportunityTitle: inferOpportunityTitle(input.message),
      suggestedOpportunityStage: stage,
      suggestedNextStep: inferNextStep(normalized),
      suggestedFollowUpDate: followUpDate,
      suggestedTaskTitle: inferTaskTitle(normalized),
      taskType,
      signals: {
        objections,
        risk: normalized.includes("riesgo") ? "alto" : undefined,
        buyingIntent: inferBuyingIntent(normalized),
      },
    } satisfies LauraExtractionResult);
  }
}

@Injectable()
export class LauraLlmService {
  constructor(
    @Inject(LAURA_EXTRACTOR_PROVIDER)
    private readonly provider: LauraExtractorProvider,
  ) {}

  async extract(input: {
    message: string;
    contextSummary?: string;
    recentMessages: string[];
  }): Promise<LauraExtractionResult> {
    const raw = await this.provider.extract({
      ...input,
      systemPrompt: LAURA_SYSTEM_PROMPT,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new BadRequestException("Laura extractor returned malformed JSON");
    }

    return this.parseExtractionResult(parsed);
  }

  private parseExtractionResult(value: unknown): LauraExtractionResult {
    if (!value || typeof value !== "object") {
      throw new BadRequestException("Laura extractor returned malformed JSON");
    }

    const candidate = value as Record<string, unknown>;
    if (candidate.intent !== "report" && candidate.intent !== "agenda_query") {
      throw new BadRequestException("Laura extractor returned malformed JSON");
    }

    const stage = candidate.suggestedOpportunityStage;
    if (stage && !Object.values(OpportunityStage).includes(stage as OpportunityStage)) {
      throw new BadRequestException("Laura extractor returned malformed JSON");
    }

    const taskType = candidate.taskType;
    if (taskType && !Object.values(FollowUpTaskType).includes(taskType as FollowUpTaskType)) {
      throw new BadRequestException("Laura extractor returned malformed JSON");
    }

    const signals = candidate.signals;
    if (signals && typeof signals !== "object") {
      throw new BadRequestException("Laura extractor returned malformed JSON");
    }

    const customerName = readOptionalStringField(candidate, "customerName");
    const contactName = readOptionalStringField(candidate, "contactName");
    const interactionSummary = readOptionalStringField(candidate, "interactionSummary");
    const suggestedOpportunityTitle = readOptionalStringField(candidate, "suggestedOpportunityTitle");
    const suggestedNextStep = readOptionalStringField(candidate, "suggestedNextStep");
    const suggestedFollowUpDate = readOptionalStringField(candidate, "suggestedFollowUpDate");
    const suggestedTaskTitle = readOptionalStringField(candidate, "suggestedTaskTitle");

    return {
      intent: candidate.intent,
      customerName,
      contactName,
      interactionSummary,
      suggestedOpportunityTitle,
      suggestedOpportunityStage: stage as OpportunityStage | undefined,
      suggestedNextStep,
      suggestedFollowUpDate,
      suggestedTaskTitle,
      taskType: taskType as FollowUpTaskType | undefined,
      signals: signals
        ? readSignals(signals as Record<string, unknown>)
        : undefined,
    };
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readOptionalStringField(
  candidate: Record<string, unknown>,
  field: string,
) {
  const value = candidate[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new BadRequestException("Laura extractor returned malformed JSON");
  }

  return asString(value);
}

function readSignals(signals: Record<string, unknown>) {
  const objections = signals.objections;
  if (objections !== undefined) {
    if (!Array.isArray(objections) || objections.some((item) => typeof item !== "string")) {
      throw new BadRequestException("Laura extractor returned malformed JSON");
    }
  }

  const risk = readOptionalStringField(signals, "risk");
  const buyingIntent = readOptionalStringField(signals, "buyingIntent");

  return {
    objections: objections as string[] | undefined,
    risk,
    buyingIntent,
  };
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAgendaQuery(normalized: string) {
  return normalized.includes("agenda") || normalized.includes("prioridades") || normalized.includes("pendientes");
}

function inferOpportunityStage(normalized: string) {
  if (normalized.includes("cotizacion") || normalized.includes("propuesta")) {
    return OpportunityStage.cotizacion;
  }

  if (normalized.includes("visita")) {
    return OpportunityStage.visita;
  }

  if (normalized.includes("interes") || normalized.includes("retomar") || normalized.includes("reactivar")) {
    return OpportunityStage.negociacion;
  }

  return OpportunityStage.contacto;
}

function inferFollowUpDate(normalized: string) {
  if (normalized.includes("viernes")) {
    return "2026-05-01T15:00:00.000Z";
  }

  if (normalized.includes("proxima semana") || normalized.includes("proxima")) {
    return "2026-05-04T15:00:00.000Z";
  }

  return "2026-05-01T15:00:00.000Z";
}

function inferOpportunityTitle(message: string) {
  return message.toLowerCase().includes("propuesta")
    ? "Seguimiento de propuesta comercial"
    : "Seguimiento comercial";
}

function inferNextStep(normalized: string) {
  if (normalized.includes("visita")) {
    return "Coordinar visita comercial";
  }

  if (normalized.includes("propuesta") || normalized.includes("cotizacion")) {
    return "Enviar propuesta comercial";
  }

  return "Dar seguimiento comercial";
}

function inferTaskTitle(normalized: string) {
  if (normalized.includes("propuesta") || normalized.includes("cotizacion")) {
    return "Preparar propuesta comercial";
  }

  if (normalized.includes("visita")) {
    return "Confirmar visita comercial";
  }

  return "Registrar seguimiento comercial";
}

function inferBuyingIntent(normalized: string) {
  if (normalized.includes("interes") || normalized.includes("quiere") || normalized.includes("confirmo")) {
    return "alto";
  }

  return "medio";
}

function extractObjections(message: string) {
  const lower = message.toLowerCase();
  const objections: string[] = [];
  if (lower.includes("precio")) {
    objections.push("precio");
  }
  if (lower.includes("entrega")) {
    objections.push("entrega");
  }
  return objections;
}
