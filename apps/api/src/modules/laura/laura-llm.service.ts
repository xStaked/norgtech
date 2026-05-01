import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { FollowUpTaskType, OpportunityStage } from "@prisma/client";
import { LAURA_SYSTEM_PROMPT } from "./prompts/laura-system-prompt";
import { parseRelativeDate, formatIsoDate } from "./laura-date-parser";

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
    const followUpDate = parseRelativeDate(input.message)?.toISOString() ?? formatIsoDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
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
      const cleaned = raw
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?\s*```$/,"")
        .trim();
      parsed = JSON.parse(cleaned) as unknown;
    } catch {
      throw new BadRequestException(`Laura extractor returned malformed JSON: ${raw.slice(0, 200)}`);
    }

    return this.parseExtractionResult(parsed);
  }

  private parseExtractionResult(value: unknown): LauraExtractionResult {
    if (!value || typeof value !== "object") {
      throw new BadRequestException("Laura extractor returned malformed JSON (not an object)");
    }

    const candidate = value as Record<string, unknown>;
    if (candidate.intent !== "report" && candidate.intent !== "agenda_query") {
      throw new BadRequestException(`Laura extractor returned unexpected intent: ${String(candidate.intent)}`);
    }

    if (candidate.intent === "agenda_query") {
      return { intent: "agenda_query" };
    }

    const stage = normalizeStage(candidate.suggestedOpportunityStage);
    const taskType = normalizeTaskType(candidate.taskType);

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

const TASK_TYPE_MAP: Record<string, FollowUpTaskType> = {
  llamada: FollowUpTaskType.llamada,
  correo: FollowUpTaskType.email,
  email: FollowUpTaskType.email,
  "e-mail": FollowUpTaskType.email,
  mail: FollowUpTaskType.email,
  whatsapp: FollowUpTaskType.whatsapp,
  reunion: FollowUpTaskType.reunion,
  reunión: FollowUpTaskType.reunion,
  recordatorio: FollowUpTaskType.recordatorio,
  llamada_telefonica: FollowUpTaskType.llamada,
  telefono: FollowUpTaskType.llamada,
  teléfono: FollowUpTaskType.llamada,
  videollamada: FollowUpTaskType.reunion,
};

const STAGE_MAP: Record<string, OpportunityStage> = {
  prospecto: OpportunityStage.prospecto,
  contacto: OpportunityStage.contacto,
  visita: OpportunityStage.visita,
  cotizacion: OpportunityStage.cotizacion,
  cotización: OpportunityStage.cotizacion,
  propuesta: OpportunityStage.cotizacion,
  negociacion: OpportunityStage.negociacion,
  negociación: OpportunityStage.negociacion,
  orden_facturacion: OpportunityStage.orden_facturacion,
  factura: OpportunityStage.orden_facturacion,
  venta_cerrada: OpportunityStage.venta_cerrada,
  cerrada: OpportunityStage.venta_cerrada,
  perdida: OpportunityStage.perdida,
  pérdida: OpportunityStage.perdida,
};

function normalizeTaskType(value: unknown): FollowUpTaskType | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase().trim();
  return TASK_TYPE_MAP[normalized] ?? (Object.values(FollowUpTaskType).includes(normalized as FollowUpTaskType) ? normalized as FollowUpTaskType : undefined);
}

function normalizeStage(value: unknown): OpportunityStage | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase().trim();
  return STAGE_MAP[normalized] ?? (Object.values(OpportunityStage).includes(normalized as OpportunityStage) ? normalized as OpportunityStage : undefined);
}
