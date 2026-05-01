# Laura Backend LLM + Frontend UX Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Laura's deterministic stub extractor with a real OpenAI-powered LLM provider, fix critical UX issues on the frontend, and prepare the architecture for future RAG integration.

**Architecture:** Adapter pattern on `LAURA_EXTRACTOR_PROVIDER` lets us swap between `DeterministicLauraExtractorProvider` (tests/stubs) and `OpenAILauraExtractorProvider` (production) via environment variable. Frontend fixes are independent of the LLM provider change. System prompt uses injectable sections for RAG-readiness.

**Tech Stack:** NestJS 11, OpenAI Node SDK, Jaro-Winkler distance, chrono-node (Spanish locale), React 19, Next.js 16

**Working directory:** `/Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `apps/api/src/modules/laura/laura-openai-extractor.provider.ts` | OpenAI LLM provider implementation |
| `apps/api/src/modules/laura/laura-date-parser.ts` | Date parsing with chrono-node |
| `apps/api/src/modules/laura/laura-similarity.ts` | Jaro-Winkler string similarity |
| `apps/api/src/modules/laura/prompts/prompt-sections.ts` | RAG-ready prompt section templates |
| `apps/api/src/modules/laura/laura-pagination.helper.ts` | Agenda priority calculation helper |
| `apps/web/src/components/laura/laura-agenda-card.tsx` | Agenda items as cards |
| `apps/web/src/components/laura/laura-objections-input.tsx` | Tag/chip input for objections |
| `apps/web/src/hooks/use-auto-scroll.ts` | Auto-scroll hook for message list |

### Modified files

| File | Change |
|------|--------|
| `apps/api/src/modules/laura/laura-llm.service.ts` | Add timeout, inject prompt sections, remove hardcoded helper functions |
| `apps/api/src/modules/laura/laura.module.ts` | Bind OpenAI provider conditionally, add ConfigModule |
| `apps/api/src/modules/laura/laura-context-resolver.service.ts` | Replace `includes()` with Jaro-Winkler scoring |
| `apps/api/src/modules/laura/laura.service.ts` | Multi-type clarification, date parsing, agenda priority, task persistence |
| `apps/api/src/modules/laura/laura-persistence.service.ts` | Persist task blocks |
| `apps/api/src/modules/laura/prompts/laura-system-prompt.ts` | Full RAG-ready prompt with sections |
| `apps/api/src/modules/laura/laura.types.ts` | Add `priorityGroup` to agenda items |
| `apps/api/src/modules/laura/laura.controller.ts` | Add Throttle guard |
| `apps/api/package.json` | Add openai, jaro-winkler, chrono-node dependencies |
| `apps/web/src/components/laura/laura-chat.tsx` | Resilient error handling, pending message state |
| `apps/web/src/components/laura/laura-message-list.tsx` | Auto-scroll |
| `apps/web/src/components/laura/laura-proposal-card.tsx` | Use objections chips component |
| `apps/web/src/components/laura/laura-composer.tsx` | Validation (min 5 chars), placeholder examples |
| `apps/web/src/components/laura/laura-types.ts` | Add `priorityGroup`, `scheduledAt` to agenda items |

---

## Wave 1 — Backend LLM + Frontend Crítico

### Task 1: Install dependencies and configure environment

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install backend dependencies**

Run:
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/api add openai jaro-winkler chrono-node @nestjs/config
```

Expected: `package.json` updated with `openai`, `jaro-winkler`, `chrono-node`, `@nestjs/config`.

- [ ] **Step 2: Add environment variable stubs**

Modify `apps/api/.env` (or create if missing) — add:

```
# Laura LLM
OPENAI_API_KEY=
LAURA_LLM_MODEL=gpt-4o-mini
LAURA_LLM_TIMEOUT_MS=30000
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/.env
git commit -m "chore(api): add openai, jaro-winkler, chrono-node dependencies"
```

---

### Task 2: RAG-ready system prompt

**Files:**
- Create: `apps/api/src/modules/laura/prompts/prompt-sections.ts`
- Modify: `apps/api/src/modules/laura/prompts/laura-system-prompt.ts`

- [ ] **Step 1: Create prompt section templates**

Create `apps/api/src/modules/laura/prompts/prompt-sections.ts`:

```typescript
export const SYSTEM_IDENTITY = `Eres Laura, asistente comercial del CRM Norgtech. Tu trabajo es ayudar a los comerciales a registrar visitas, seguimientos y oportunidades de forma rápida y natural.

Tu tono es cálido, cercano, breve y profesional. Nunca menciones que eres una IA. Nunca des respuestas tipo menú de opciones.`;

export const SYSTEM_RULES = `Reglas estrictas:
1. Si hay ambigüedad en el cliente, oportunidad, fecha o acción principal, establece "needsClarification" a true y proporciona las opciones detectadas en "clarificationOptions".
2. Nunca inventes datos que no estén en el mensaje del usuario o en el contexto proporcionado.
3. Convierte todas las fechas relativas a formato ISO 8601. "mañana" → calcula desde hoy. "el viernes" → próximo viernes. "próxima semana" → próximo lunes.
4. Si el usuario pregunta por pendientes, agenda o prioridades, establece "intent" a "agenda_query".
5. Si el usuario responde a una clarificación previa (ej: "sí, el primero"), usa el contexto de mensajes anteriores para resolver la ambigüedad.
6. Extrae objeciones explícitamente mencionadas. No infieras objeciones que el usuario no mencionó.
7. Si no puedes detectar un cliente, deja customerName como null.`;

export const SYSTEM_SCHEMA = `Devuelve EXCLUSIVAMENTE un objeto JSON con esta estructura, sin texto adicional:

{
  "intent": "report" | "agenda_query",
  "customerName": "string | null",
  "contactName": "string | null",
  "interactionSummary": "string",
  "suggestedOpportunityTitle": "string | null",
  "suggestedOpportunityStage": "prospecto | contacto | visita | cotizacion | negociacion | orden_facturacion | venta_cerrada | perdida",
  "suggestedNextStep": "string | null",
  "suggestedFollowUpDate": "ISO 8601 date string | null",
  "suggestedTaskTitle": "string | null",
  "taskType": "llamada | correo | reunion | whatsapp",
  "signals": {
    "objections": ["string"],
    "risk": "string | null",
    "buyingIntent": "alto | medio | bajo | null"
  },
  "needsClarification": boolean,
  "clarificationField": "customer | opportunity | date | action | null",
  "clarificationOptions": [{ "id": "string", "label": "string" }] | null
}`;

export const SYSTEM_EXAMPLES = `Ejemplo 1 — Reporte de visita:
Input: "Estuve con Agropecuaria Lara ayer, quieren propuesta para 2 galpones, les preocupa el costo inicial y debo hablar con compras el martes."
Output:
{
  "intent": "report",
  "customerName": "Agropecuaria Lara",
  "interactionSummary": "Visita a Agropecuaria Lara. Quieren propuesta para 2 galpones. Preocupación por costo inicial. Pendiente hablar con compras.",
  "suggestedOpportunityTitle": "Propuesta galpones Agropecuaria Lara",
  "suggestedOpportunityStage": "cotizacion",
  "suggestedNextStep": "Enviar propuesta comercial para 2 galpones",
  "suggestedFollowUpDate": "[próximo martes ISO 8601]",
  "suggestedTaskTitle": "Hablar con departamento de compras",
  "taskType": "reunion",
  "signals": { "objections": ["costo inicial"], "risk": "medio", "buyingIntent": "alto" },
  "needsClarification": false,
  "clarificationField": null,
  "clarificationOptions": null
}

Ejemplo 2 — Consulta de agenda:
Input: "Qué tengo pendiente hoy"
Output:
{
  "intent": "agenda_query",
  "needsClarification": false,
  "clarificationField": null,
  "clarificationOptions": null
}

Ejemplo 3 — Ambigüedad en cliente:
Input: "Hable con Pérez y quiere retomar la propuesta"
Output:
{
  "intent": "report",
  "customerName": null,
  "needsClarification": true,
  "clarificationField": "customer",
  "clarificationOptions": [
    { "id": "[id cliente 1]", "label": "Pérez Acuícola SAS" },
    { "id": "[id cliente 2]", "label": "Pérez Trading SAS" }
  ]
}`;

export function fillPromptSections(
  systemPrompt: string,
  sections: { context?: string; recentMessages?: string; agendaSummary?: string },
): string {
  let filled = systemPrompt;

  filled = filled.replace('{INJECTED_CONTEXT}', sections.context ?? 'Sin contexto de cliente adicional.');
  filled = filled.replace('{INJECTED_MESSAGES}', sections.recentMessages ?? 'Sin mensajes previos en esta sesión.');
  filled = filled.replace('{INJECTED_AGENDA}', sections.agendaSummary ?? '');

  return filled;
}
```

- [ ] **Step 2: Rewrite the system prompt**

Modify `apps/api/src/modules/laura/prompts/laura-system-prompt.ts`:

```typescript
import { SYSTEM_IDENTITY, SYSTEM_RULES, SYSTEM_SCHEMA, SYSTEM_EXAMPLES } from "./prompt-sections";

export const LAURA_SYSTEM_PROMPT = `${SYSTEM_IDENTITY}

${SYSTEM_RULES}

${SYSTEM_SCHEMA}

${SYSTEM_EXAMPLES}

Contexto del cliente:
{INJECTED_CONTEXT}

Mensajes anteriores en esta sesión:
{INJECTED_MESSAGES}

Resumen de agenda pendiente:
{INJECTED_AGENDA}`.trim();
```

- [ ] **Step 3: Verify existing tests still pass**

Run:
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/api test -- --testPathPattern="laura" --testNamePattern="" 2>&1 | tail -20
```

Expected: All existing Laura e2e tests still pass (they use deterministic extractor, prompt changes don't affect them).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/laura/prompts/
git commit -m "feat(api): add RAG-ready system prompt with injectable sections"
```

---

### Task 3: OpenAI Laura Extractor Provider

**Files:**
- Create: `apps/api/src/modules/laura/laura-openai-extractor.provider.ts`
- Modify: `apps/api/src/modules/laura/laura.module.ts`

- [ ] **Step 1: Create the OpenAI provider**

Create `apps/api/src/modules/laura/laura-openai-extractor.provider.ts`:

```typescript
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { LAURA_SYSTEM_PROMPT } from "./prompts/laura-system-prompt";
import { fillPromptSections } from "./prompts/prompt-sections";
import { LauraExtractorProvider } from "./laura-llm.service";

const MAX_RETRIES = 1;
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

@Injectable()
export class OpenAILauraExtractorProvider implements LauraExtractorProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly logger = new Logger(OpenAILauraExtractorProvider.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when using OpenAILauraExtractorProvider");
    }

    this.client = new OpenAI({ apiKey });
    this.model = this.configService.get<string>("LAURA_LLM_MODEL") ?? DEFAULT_MODEL;
    this.timeoutMs = this.configService.get<number>("LAURA_LLM_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS;
  }

  async extract(input: {
    message: string;
    contextSummary?: string;
    recentMessages: string[];
    systemPrompt: string;
  }): Promise<string> {
    const filledSystemPrompt = fillPromptSections(input.systemPrompt, {
      context: input.contextSummary,
      recentMessages: input.recentMessages.join("\n"),
    });

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.chat.completions.create(
          {
            model: this.model,
            response_format: { type: "json_object" },
            temperature: 0.3,
            max_tokens: 1024,
            messages: [
              { role: "system", content: filledSystemPrompt },
              { role: "user", content: input.message },
            ],
          },
          {
            timeout: this.timeoutMs,
          },
        );

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new BadRequestException("Laura extractor returned empty response");
        }

        return content;
      } catch (error: unknown) {
        lastError = error;
        this.logger.warn(
          `OpenAI extraction attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`,
        );

        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw new BadRequestException(
      `Laura extractor failed after ${MAX_RETRIES + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }
}
```

- [ ] **Step 2: Update the module binding**

Modify `apps/api/src/modules/laura/laura.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { FollowUpTasksModule } from "../follow-up-tasks/follow-up-tasks.module";
import {
  DeterministicLauraExtractorProvider,
  LAURA_EXTRACTOR_PROVIDER,
  LauraLlmService,
} from "./laura-llm.service";
import { OpenAILauraExtractorProvider } from "./laura-openai-extractor.provider";
import { LauraContextResolverService } from "./laura-context-resolver.service";
import { LauraController } from "./laura.controller";
import { LauraPersistenceService } from "./laura-persistence.service";
import { LauraSessionService } from "./laura-session.service";
import { LauraService } from "./laura.service";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { VisitsModule } from "../visits/visits.module";

const extractorProvider = process.env.OPENAI_API_KEY
  ? {
      provide: LAURA_EXTRACTOR_PROVIDER,
      useClass: OpenAILauraExtractorProvider,
    }
  : {
      provide: LAURA_EXTRACTOR_PROVIDER,
      useExisting: DeterministicLauraExtractorProvider,
    };

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    OpportunitiesModule,
    FollowUpTasksModule,
    VisitsModule,
    ConfigModule.forFeature(),
  ],
  controllers: [LauraController],
  providers: [
    LauraService,
    LauraSessionService,
    LauraContextResolverService,
    LauraPersistenceService,
    LauraLlmService,
    DeterministicLauraExtractorProvider,
    extractorProvider,
  ],
  exports: [LauraService],
})
export class LauraModule {}
```

- [ ] **Step 3: Verify the module compiles**

Run:
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/api build 2>&1 | tail -10
```

Expected: Successful build. If there are import errors, fix them.

- [ ] **Step 4: Verify existing tests still pass**

Run:
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/api test -- --testPathPattern="laura" 2>&1 | tail -20
```

Expected: All existing e2e tests pass (they use deterministic extractor via mock override, the module change doesn't affect test overrides since `LAURA_EXTRACTOR_PROVIDER` token is still bound).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/laura/laura-openai-extractor.provider.ts apps/api/src/modules/laura/laura.module.ts
git commit -m "feat(api): add OpenAI extractor provider with conditional binding"
```

---

### Task 4: Jaro-Winkler string similarity for context resolution

**Files:**
- Create: `apps/api/src/modules/laura/laura-similarity.ts`
- Modify: `apps/api/src/modules/laura/laura-context-resolver.service.ts`

- [ ] **Step 1: Create similarity utility**

Create `apps/api/src/modules/laura/laura-similarity.ts`:

```typescript
import { distance as jaroWinklerDistance } from "jaro-winkler";

export interface SimilarityMatch {
  id: string;
  label: string;
  score: number;
}

const THRESHOLD_HIGH = 0.92;
const THRESHOLD_MEDIUM = 0.82;
const THRESHOLD_AMBIGUOUS = 0.70;

export function similarity(a: string, b: string): number {
  return jaroWinklerDistance(a, b);
}

export function classifyMatch(score: number): "high" | "medium" | "low" | "none" {
  if (score >= THRESHOLD_HIGH) return "high";
  if (score >= THRESHOLD_MEDIUM) return "medium";
  if (score >= THRESHOLD_AMBIGUOUS) return "low";
  return "none";
}

export function isAmbiguous(matches: SimilarityMatch[]): boolean {
  return matches.filter((m) => m.score >= THRESHOLD_AMBIGUOUS).length > 1;
}

export function bestMatch(matches: SimilarityMatch[]): SimilarityMatch | null {
  if (matches.length === 0) return null;
  return matches.reduce((best, current) => (current.score > best.score ? current : best));
}
```

- [ ] **Step 2: Rewrite context resolver to use similarity scoring**

Replace the matching logic in `apps/api/src/modules/laura/laura-context-resolver.service.ts`. The full file becomes:

```typescript
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { bestMatch, classifyMatch, isAmbiguous, similarity, type SimilarityMatch } from "./laura-similarity";

type CustomerRecord = {
  id: string;
  displayName: string;
  legalName: string;
  contacts: Array<{
    fullName: string;
  }>;
};

export type ResolvedCustomer =
  | { status: "resolved"; customerId: string; confidence: "high" | "medium"; label: string }
  | { status: "ambiguous"; query: string; options: Array<{ customerId: string; label: string }> }
  | { status: "unresolved" };

type LauraContextClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class LauraContextResolverService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeText(text: string) {
    return text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async resolveCustomerFromText(text: string, client?: LauraContextClient): Promise<ResolvedCustomer> {
    const normalizedText = this.normalizeText(text);

    if (!normalizedText) {
      return { status: "unresolved" };
    }

    const customers = await this.listCustomers(client);
    const candidateTexts = this.candidateTexts(normalizedText);

    for (const candidateText of candidateTexts) {
      const allScores = this.scoreCustomersAgainstText(customers, candidateText);

      const highOrMediumMatches = allScores.filter(
        (match) => classifyMatch(match.score) === "high" || classifyMatch(match.score) === "medium",
      );

      if (highOrMediumMatches.length === 0) {
        continue;
      }

      if (highOrMediumMatches.length === 1) {
        const match = highOrMediumMatches[0];
        const confidence = classifyMatch(match.score) as "high" | "medium";
        const customer = customers.find((c) => c.id === match.id)!;
        return this.toResolvedCustomer(customer, confidence);
      }

      if (isAmbiguous(highOrMediumMatches)) {
        return this.toAmbiguousCustomer(
          highOrMediumMatches.map((m) => customers.find((c) => c.id === m.id)!),
          this.bestQueryFromMatches(normalizedText, highOrMediumMatches, customers),
        );
      }

      const match = bestMatch(highOrMediumMatches);
      if (match) {
        const customer = customers.find((c) => c.id === match.id)!;
        return this.toResolvedCustomer(customer, "medium");
      }
    }

    return { status: "unresolved" };
  }

  async getCustomerOptionById(customerId: string, client?: LauraContextClient) {
    const customers = await this.listCustomers(client);
    const customer = customers.find((item) => item.id === customerId);

    if (!customer) {
      return null;
    }

    return {
      id: customer.id,
      label: customer.displayName,
    };
  }

  async getCustomerOptionFromOpportunity(opportunityId: string, client?: LauraContextClient) {
    const db = client ?? this.prisma;
    const opportunity = await db.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      return null;
    }

    return this.getCustomerOptionById(opportunity.customerId, db);
  }

  private scoreCustomersAgainstText(customers: CustomerRecord[], text: string): SimilarityMatch[] {
    const scores: SimilarityMatch[] = [];

    for (const customer of customers) {
      const normalizedDisplayName = this.normalizeText(customer.displayName);
      const normalizedLegalName = this.normalizeText(customer.legalName);
      const contactNames = customer.contacts.map((c) => this.normalizeText(c.fullName));

      const candidateScores = [
        similarity(text, normalizedDisplayName),
        similarity(text, normalizedLegalName),
        ...contactNames.map((name) => similarity(text, name)),
        ...this.scoreByTokenMatch(text, customer),
      ];

      const bestScore = Math.max(...candidateScores);
      scores.push({ id: customer.id, label: customer.displayName, score: bestScore });
    }

    return scores;
  }

  private scoreByTokenMatch(text: string, customer: CustomerRecord): number[] {
    const textTokens = text.split(" ").filter((t) => t.length >= 4);
    const customerTokens = this.customerTokens(customer);

    return customerTokens
      .filter((token) => token.length >= 4)
      .map((customerToken) => {
        const tokenScores = textTokens.map((textToken) => similarity(textToken, customerToken));
        return Math.max(0, ...tokenScores);
      });
  }

  private customerTokens(customer: CustomerRecord) {
    return Array.from(
      new Set(
        [
          ...this.normalizeText(customer.displayName).split(" "),
          ...this.normalizeText(customer.legalName).split(" "),
          ...customer.contacts.flatMap((contact) =>
            this.normalizeText(contact.fullName).split(" "),
          ),
        ].filter(Boolean),
      ),
    );
  }

  private toResolvedCustomer(customer: CustomerRecord, confidence: "high" | "medium"): ResolvedCustomer {
    return {
      status: "resolved",
      customerId: customer.id,
      confidence,
      label: customer.displayName,
    };
  }

  private toAmbiguousCustomer(customers: CustomerRecord[], query: string): ResolvedCustomer {
    return {
      status: "ambiguous",
      query,
      options: customers.map((customer) => ({
        customerId: customer.id,
        label: customer.displayName,
      })),
    };
  }

  private bestQueryFromMatches(normalizedText: string, matches: SimilarityMatch[], customers: CustomerRecord[]) {
    const matchingTokens = customers
      .filter((c) => matches.some((m) => m.id === c.id))
      .flatMap((customer) =>
        this.customerTokens(customer).filter((token) =>
          token.length >= 4 && normalizedText.includes(token),
        ),
      );

    const preferredToken = matchingTokens.sort((a, b) => b.length - a.length)[0] ?? "cliente";
    return preferredToken.charAt(0).toUpperCase() + preferredToken.slice(1);
  }

  private async listCustomers(client?: LauraContextClient): Promise<CustomerRecord[]> {
    const db = client ?? this.prisma;

    return db.customer.findMany({
      include: {
        contacts: true,
      },
    }) as Promise<CustomerRecord[]>;
  }

  private candidateTexts(normalizedText: string) {
    const focusedSegments = [" sobre ", " para ", " con "]
      .map((delimiter) => {
        const parts = normalizedText.split(delimiter);
        return parts.length > 1 ? parts[parts.length - 1]?.trim() : "";
      })
      .filter((segment) => segment.length > 0);

    return [...focusedSegments, normalizedText];
  }
}
```

- [ ] **Step 3: Verify tests pass**

Run:
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/api test -- --testPathPattern="laura" 2>&1 | tail -20
```

Expected: All tests pass. The e2e tests override the provider with deterministic stub, but context resolution uses the real similarity service now. Expected behavior: same matches for exact names, improved matching for partial names.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/laura/laura-similarity.ts apps/api/src/modules/laura/laura-context-resolver.service.ts
git commit -m "feat(api): replace substring matching with Jaro-Winkler similarity scoring"
```

---

### Task 5: Date parsing with chrono-node

**Files:**
- Create: `apps/api/src/modules/laura/laura-date-parser.ts`
- Modify: `apps/api/src/modules/laura/laura-llm.service.ts` (remove hardcoded `inferFollowUpDate`)
- Modify: `apps/api/src/modules/laura/laura.service.ts` (use date parser)

- [ ] **Step 1: Create date parser**

Create `apps/api/src/modules/laura/laura-date-parser.ts`:

```typescript
import chrono from "chrono-node";

const esConfiguration = chrono.casual.clone();
esConfiguration.refiners.push({
  refine: (text, results) => {
    results.forEach((result) => {
      if (result.start.isCertain("month") && !result.start.isCertain("hour")) {
        result.start.assign("hour", 15);
      }
    });
    return results;
  },
});

export function parseRelativeDate(text: string, referenceDate?: Date): Date | null {
  const result = esConfiguration.parseDate(text, referenceDate ?? new Date(), { forwardDate: true });
  return result ?? null;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString();
}
```

- [ ] **Step 2: Remove hardcoded date inference from deterministic extractor**

In `apps/api/src/modules/laura/laura-llm.service.ts`, remove the `inferFollowUpDate` function and update `DeterministicLauraExtractorProvider` to use `parseRelativeDate`:

At the top, add:
```typescript
import { parseRelativeDate, formatIsoDate } from "./laura-date-parser";
```

Remove the function `inferFollowUpDate` (lines 214-224) entirely.

In `DeterministicLauraExtractorProvider.extract()`, change the `suggestedFollowUpDate` line from:
```typescript
const followUpDate = inferFollowUpDate(normalized);
```
to:
```typescript
const followUpDate = parseRelativeDate(input.message)?.toISOString() ?? formatIsoDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
```

- [ ] **Step 3: Verify tests pass**

Run:
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/api test -- --testPathPattern="laura" 2>&1 | tail -20
```

Expected: Tests may have date assertions that used hardcoded `2026-05-01`. If so, adjust test expectations to use dynamic date or just verify date format with `expect.any(String)`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/laura/laura-date-parser.ts apps/api/src/modules/laura/laura-llm.service.ts
git commit -m "feat(api): replace hardcoded date inference with chrono-node parsing"
```

---

### Task 6: Multi-type clarification + agenda priority + task persistence

**Files:**
- Modify: `apps/api/src/modules/laura/laura.service.ts`
- Modify: `apps/api/src/modules/laura/laura-persistence.service.ts`
- Modify: `apps/api/src/modules/laura/laura.types.ts`

- [ ] **Step 1: Add priority fields to agenda types**

In `apps/api/src/modules/laura/laura.types.ts`, update `LauraAgendaPayload`:

```typescript
export interface LauraAgendaPayload {
  items: Array<{
    id: string;
    type: "visit" | "follow_up_task";
    label: string;
    scheduledAt?: string;
    priorityGroup?: number;
  }>;
}
```

- [ ] **Step 2: Update agenda builder with priority logic**

In `apps/api/src/modules/laura/laura.service.ts`, replace the `buildAgendaPayload` method with:

```typescript
private async buildAgendaPayload(
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<LauraAgendaPayload> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));

  const [tasks, visits] = await Promise.all([
    tx.followUpTask.findMany({
      where: {
        assignedToUserId: userId,
        status: FollowUpTaskStatus.pendiente,
      },
    }),
    tx.visit.findMany({
      where: {
        assignedToUserId: userId,
        status: VisitStatus.programada,
      },
    }),
  ]);

  const items = [
    ...tasks.map((task) => {
      const dueAt = task.dueAt;
      let priorityGroup = 3;
      if (dueAt < todayStart) priorityGroup = 0;
      else if (dueAt <= todayEnd) priorityGroup = 1;
      else if (dueAt < weekEnd) priorityGroup = 2;

      return {
        id: task.id,
        type: "follow_up_task" as const,
        label: task.title,
        scheduledAt: dueAt.toISOString(),
        priorityGroup,
      };
    }),
    ...visits.map((visit) => {
      const scheduledAt = visit.scheduledAt;
      let priorityGroup = 3;
      if (scheduledAt < todayStart) priorityGroup = 0;
      else if (scheduledAt <= todayEnd) priorityGroup = 2;
      else if (scheduledAt < weekEnd) priorityGroup = 2;

      return {
        id: visit.id,
        type: "visit" as const,
        label: visit.summary?.trim() || visit.nextStep?.trim() || "Visita programada",
        scheduledAt: scheduledAt.toISOString(),
        priorityGroup,
      };
    }),
  ];

  items.sort((a, b) => {
    const byPriority = a.priorityGroup - b.priorityGroup;
    if (byPriority !== 0) return byPriority;
    return new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime();
  });

  return {
    items: items.map(({ id, type, label, scheduledAt, priorityGroup }) => ({
      id,
      type,
      label,
      scheduledAt,
      priorityGroup,
    })),
  };
}
```

- [ ] **Step 3: Add task persistence to LauraPersistenceService**

In `apps/api/src/modules/laura/laura-persistence.service.ts`, change the task block handling (lines 109-111) from always discarding to persisting as a FollowUpTask:

Replace:
```typescript
if (blocks.task) {
  discarded.push("task");
}
```

With:
```typescript
if (blocks.task?.enabled && customerId) {
  const task = await this.followUpTasksService.createFromLaura(
    user,
    {
      customerId,
      opportunityId: opportunityId ?? undefined,
      title: blocks.task.title,
      dueAt: blocks.task.dueAt ?? blocks.followUp?.dueAt ?? formatIsoDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
      type: "llamada",
      notes: blocks.task.notes,
    },
    client,
  );
  saved.push("task");
  createdIds.task = task.id;
} else if (blocks.task) {
  discarded.push("task");
}
```

Add the import at top:
```typescript
import { formatIsoDate } from "./laura-date-parser";
```

- [ ] **Step 4: Expand clarification types in laura.service.ts**

In `createClarificationResponse`, change the hardcoded `type: "customer"` to accept a parameter:

```typescript
private async createClarificationResponse(
  sessionId: string,
  sourceContent: string,
  options: LauraClarificationOption[],
  message: string,
  tx: Prisma.TransactionClient,
  clarificationType: "customer" | "opportunity" | "date" | "action" = "customer",
): Promise<LauraAssistantResponse> {
  const response: LauraAssistantResponse = {
    mode: "clarification",
    sessionId,
    message,
    clarification: {
      type: clarificationType,
      options,
    },
  };
```

Update callers of `createClarificationResponse` in the same file to pass the correct type.

- [ ] **Step 5: Verify tests pass**

Run:
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/api test -- --testPathPattern="laura" 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/laura/laura.service.ts apps/api/src/modules/laura/laura-persistence.service.ts apps/api/src/modules/laura/laura.types.ts
git commit -m "feat(api): add agenda priority, task persistence, and multi-type clarification"
```

---

### Task 7: Rate limiting on Laura controller

**Files:**
- Modify: `apps/api/src/modules/laura/laura.controller.ts`

- [ ] **Step 1: Add ThrottleGuard to controller**

Modify `apps/api/src/modules/laura/laura.controller.ts`:

Add import at top:
```typescript
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
```

Add `@Throttle()` to each endpoint:
```typescript
@Throttle({ default: { limit: 10, ttl: 60000 } })
```

Place it above each `@UseGuards(JwtAuthGuard, RolesGuard)` decorator on `sendMessage`, `confirmProposal`, and `getSession`.

Note: You'll need to check if `@nestjs/throttler` is installed and `ThrottlerModule` is registered in `AppModule`. If not, install it first:

```bash
pnpm --filter @norgtech/api add @nestjs/throttler
```

And register in `app.module.ts`:
```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    // ... existing imports
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
  providers: [
    // ... existing providers
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
```

- [ ] **Step 2: Verify the app starts**

Run:
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/api build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/laura/laura.controller.ts apps/api/src/app.module.ts
git commit -m "feat(api): add rate limiting to Laura endpoints"
```

---

### Task 8: Frontend — Auto-scroll hook

**Files:**
- Create: `apps/web/src/hooks/use-auto-scroll.ts`
- Modify: `apps/web/src/components/laura/laura-message-list.tsx`

- [ ] **Step 1: Create useAutoScroll hook**

Create `apps/web/src/hooks/use-auto-scroll.ts`:

```typescript
import { useEffect, useRef } from "react";

export function useAutoScroll(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [dependency]);

  return ref;
}
```

- [ ] **Step 2: Add auto-scroll to message list**

Modify `apps/web/src/components/laura/laura-message-list.tsx`:

Add import:
```typescript
import { useAutoScroll } from "@/hooks/use-auto-scroll";
```

At the end of the component, after `{busy ? ... : null}`, add a scroll anchor:
```tsx
<div ref={useAutoScroll(messages.length + (busy ? 1 : 0))} />
```

Change the return wrapper to be a `<div style={{ ... }}>` instead of just the `<div style={{ display: "grid", gap: 14 }}>`, and add `overflow-y: auto` and `maxHeight` to make it scrollable.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-auto-scroll.ts apps/web/src/components/laura/laura-message-list.tsx
git commit -m "feat(web): add auto-scroll to Laura message list"
```

---

### Task 9: Frontend — Resilient error handling

**Files:**
- Modify: `apps/web/src/components/laura/laura-chat.tsx`

- [ ] **Step 1: Add message status to LauraMessageItem**

In `apps/web/src/components/laura/laura-types.ts`, add:

```typescript
export type LauraMessageStatus = "pending" | "confirmed" | "error";

export interface LauraMessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  kind: string;
  content: string;
  createdAt: string;
  status?: LauraMessageStatus;
}
```

- [ ] **Step 2: Update handleSend in laura-chat.tsx**

In `laura-chat.tsx`, change `handleSend` to mark messages as pending/error instead of adding/removing:

```typescript
async function handleSend(content: string) {
  const clientMessage = createClientMessage(content);
  clientMessage.status = "pending";

  setBusy(true);
  setError(null);
  setNotice(null);
  setConfirmation(null);
  setMessages((current) => [...current, clientMessage]);

  try {
    const response = await apiFetchClient("/laura/messages", {
      method: "POST",
      body: JSON.stringify({
        sessionId: sessionId ?? undefined,
        content,
        contextType: sessionId ? undefined : initialContext?.contextType,
        contextEntityId: sessionId ? undefined : initialContext?.contextEntityId,
      }),
    });

    if (!response.ok) {
      throw new Error("Laura no pudo procesar el mensaje.");
    }

    const body = (await response.json()) as LauraAssistantResponse;
    setMessages((current) =>
      current.map((m) => (m.id === clientMessage.id ? { ...m, status: "confirmed" } : m)),
    );
    setSessionId(body.sessionId);
    setMessages((current) => [
      ...current,
      createAssistantMessage(body.message, body.mode),
    ]);

    if (body.mode === "proposal") {
      setDraftProposal({
        proposalId: body.proposalId,
        proposal: body.proposal,
        status: "draft",
      });
    } else {
      setDraftProposal(null);
    }

    await loadSession(body.sessionId);
  } catch (caughtError) {
    setMessages((current) =>
      current.map((m) =>
        m.id === clientMessage.id ? { ...m, status: "error" } : m,
      ),
    );
    setError(
      caughtError instanceof Error
        ? caughtError.message
        : "Laura no pudo procesar el mensaje.",
    );
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 3: Update LauraMessageList to show error status**

In `laura-message-list.tsx`, show a "Reintentar" button next to error messages:

```tsx
{message.status === "error" && (
  <button
    type="button"
    onClick={() => onRetry?.(message.content)}
    style={{ ...retryButtonStyle }}
  >
    Reintentar
  </button>
)}
```

Add `onRetry?: (content: string) => void` to `LauraMessageList` props and pass it from `LauraChat`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/laura/laura-chat.tsx apps/web/src/components/laura/laura-message-list.tsx apps/web/src/components/laura/laura-types.ts
git commit -m "feat(web): resilient error handling with pending/confirmed/error states"
```

---

### Task 10: Frontend — Objections as chips

**Files:**
- Create: `apps/web/src/components/laura/laura-objections-input.tsx`
- Modify: `apps/web/src/components/laura/laura-proposal-card.tsx`

- [ ] **Step 1: Create ObjectionsInput component**

Create `apps/web/src/components/laura/laura-objections-input.tsx`:

```tsx
"use client";

import { useState } from "react";
import { crmTheme } from "@/components/ui/theme";

export function ObjectionsInput({
  objections,
  disabled,
  onChange,
}: {
  objections: string[];
  disabled: boolean;
  onChange: (objections: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed && !objections.includes(trimmed)) {
        onChange([...objections, trimmed]);
        setInputValue("");
      }
    }

    if (event.key === "Backspace" && inputValue === "" && objections.length > 0) {
      onChange(objections.slice(0, -1));
    }
  }

  function handleRemove(index: number) {
    onChange(objections.filter((_, i) => i !== index));
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        minHeight: 42,
        padding: "6px 10px",
        borderRadius: crmTheme.radius.md,
        border: `1px solid ${crmTheme.colors.borderStrong}`,
        background: crmTheme.colors.surface,
      }}
    >
      {objections.map((objection, index) => (
        <span
          key={objection}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: crmTheme.radius.pill,
            background: crmTheme.colors.surfaceMuted,
            fontSize: 13,
            color: crmTheme.colors.text,
          }}
        >
          {objection}
          {!disabled && (
            <button
              type="button"
              onClick={() => handleRemove(index)}
              style={{
                appearance: "none",
                border: 0,
                background: "none",
                color: crmTheme.colors.textMuted,
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
              aria-label={`Eliminar objeción: ${objection}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={objections.length === 0 ? "Escribe y presiona Enter" : ""}
        aria-label="Agregar objeción"
        style={{
          flex: 1,
          minWidth: 80,
          border: 0,
          outline: 0,
          background: "transparent",
          font: `400 14px/1.4 ${crmTheme.typography.body}`,
          color: crmTheme.colors.text,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Replace objections comma-separated input in laura-proposal-card.tsx**

In the signals block section, replace the `TextField` for objections with `ObjectionsInput`:

Replace the `<TextField label="Objeciones" ...>` block in the `signals` section with:

```tsx
<label style={{ display: "grid", gap: 8 }}>
  <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>
    Objeciones
  </span>
  <ObjectionsInput
    objections={proposal.blocks.signals.objections}
    disabled={confirming}
    onChange={(objections) =>
      updateProposal((draft) => ({
        ...draft,
        blocks: {
          ...draft.blocks,
          signals: draft.blocks.signals
            ? { ...draft.blocks.signals, objections }
            : draft.blocks.signals,
        },
      }))
    }
  />
</label>
```

Add the import at top:
```typescript
import { ObjectionsInput } from "./laura-objections-input";
```

Remove the old `TextField` usage for objections and remove the `.join(", ")` / `.split(",")` logic.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/laura/laura-objections-input.tsx apps/web/src/components/laura/laura-proposal-card.tsx
git commit -m "feat(web): replace comma-separated objections with chip input component"
```

---

## Wave 2 — Frontend UX + Backend Streaming

### Task 11: Frontend — Agenda cards UI

**Files:**
- Create: `apps/web/src/components/laura/laura-agenda-card.tsx`
- Modify: `apps/web/src/components/laura/laura-chat.tsx`
- Modify: `apps/web/src/components/laura/laura-types.ts`

- [ ] **Step 1: Update LauraAssistantResponse type to include priority fields**

In `apps/web/src/components/laura/laura-types.ts`, update the agenda type:

```typescript
export interface LauraAgendaItem {
  id: string;
  type: "visit" | "follow_up_task";
  label: string;
  scheduledAt?: string;
  priorityGroup?: number;
}
```

Update the agenda mode in `LauraAssistantResponse`:
```typescript
| {
    mode: "agenda";
    sessionId: string;
    message: string;
    agenda: {
      items: LauraAgendaItem[];
    };
  };
```

- [ ] **Step 2: Create LauraAgendaCard component**

Create `apps/web/src/components/laura/laura-agenda-card.tsx`:

```tsx
"use client";

import { crmTheme } from "@/components/ui/theme";
import type { LauraAgendaItem } from "./laura-types";

const priorityLabels: Record<number, { label: string; tone: "danger" | "warning" | "info" | "muted" }> = {
  0: { label: "Vencida", tone: "danger" },
  1: { label: "Hoy", tone: "warning" },
  2: { label: "Hoy", tone: "info" },
  3: { label: "Esta semana", tone: "muted" },
};

const typeLabels: Record<string, string> = {
  visit: "Visita",
  follow_up_task: "Seguimiento",
};

export function LauraAgendaCard({ items }: { items: LauraAgendaItem[] }) {
  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: crmTheme.colors.textMuted }}>
        No hay pendientes activos en tu agenda.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => {
        const priority = priorityLabels[item.priorityGroup ?? 3] ?? priorityLabels[3];
        const typeLabel = typeLabels[item.type] ?? item.type;

        return (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: crmTheme.radius.md,
              border: `1px solid ${crmTheme.colors.border}`,
              background: crmTheme.colors.surface,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: crmTheme.radius.pill,
                background:
                  priority.tone === "danger"
                    ? "rgba(186, 58, 47, 0.12)"
                    : priority.tone === "warning"
                      ? "rgba(234, 179, 8, 0.12)"
                      : priority.tone === "info"
                        ? "rgba(45, 108, 223, 0.08)"
                        : crmTheme.colors.surfaceMuted,
                color:
                  priority.tone === "danger"
                    ? crmTheme.colors.danger
                    : priority.tone === "warning"
                      ? "#b45309"
                      : priority.tone === "info"
                        ? crmTheme.colors.info
                        : crmTheme.colors.textMuted,
              }}
            >
              {priority.label}
            </span>
            <span style={{ fontSize: 12, color: crmTheme.colors.textMuted, minWidth: 80 }}>
              {typeLabel}
            </span>
            <span style={{ fontSize: 14, color: crmTheme.colors.text }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Render agenda items in laura-chat.tsx**

In `laura-chat.tsx`, when `mode === "agenda"`, render `<LauraAgendaCard>` instead of just the text message:

Import:
```typescript
import { LauraAgendaCard } from "./laura-agenda-card";
```

After the `<LauraMessageList>` component, add agenda rendering when the last assistant message is agenda type. This requires tracking the agenda data in state. Add:

```typescript
const [agendaItems, setAgendaItems] = useState<LauraAgendaItem[]>([]);
```

In `handleSend`, when `body.mode === "agenda"`, add:
```typescript
setAgendaItems(body.agenda.items);
```

In the render, after `<LauraMessageList>`, add:
```tsx
{agendaItems.length > 0 && (
  <LauraAgendaCard items={agendaItems} />
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/laura/laura-agenda-card.tsx apps/web/src/components/laura/laura-chat.tsx apps/web/src/components/laura/laura-types.ts
git commit -m "feat(web): add dedicated agenda cards UI with priority badges"
```

---

### Task 12: Frontend — Composer validation

**Files:**
- Modify: `apps/web/src/components/laura/laura-composer.tsx`

- [ ] **Step 1: Add min-length validation and placeholder rotation**

Modify `LauraComposer`:

```tsx
const MIN_LENGTH = 5;

const placeholderExamples = [
  "Ejemplo: Visité a Acme, confirmaron interés y piden nueva visita",
  "Ejemplo: Tengo pendiente llamar a Pérez sobre la propuesta",
  "Ejemplo: Que tengo pendiente hoy?",
  "Ejemplo: El cliente Lago quiere cotización para el próximo viernes",
];

export function LauraComposer({ disabled, onSubmit }: { disabled?: boolean; onSubmit: (value: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [placeholder] = useState(() => placeholderExamples[Math.floor(Math.random() * placeholderExamples.length)]);

  // ... existing handleSubmit ...

  const canSend = !disabled && value.trim().length >= MIN_LENGTH;

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <label htmlFor="laura-message" style={{ fontSize: 13, fontWeight: 700, color: crmTheme.colors.textSubtle }}>
        Mensaje para Laura
      </label>
      <textarea
        id="laura-message"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={4}
        placeholder={placeholder}
        disabled={disabled}
        style={{ /* existing styles */ }}
      />
      <div style={{ /* existing styles */ }}>
        {value.trim().length > 0 && value.trim().length < MIN_LENGTH ? (
          <p style={{ margin: 0, fontSize: 12, color: crmTheme.colors.danger }}>
            Escribe al menos {MIN_LENGTH} caracteres
          </p>
        ) : (
          <p style={{ /* existing muted text */ }}>
            Laura estructura la interacción y te deja editar cada bloque antes de guardar.
          </p>
        )}
        <button
          type="submit"
          disabled={!canSend}
          style={{
            /* existing styles, replace disabled condition */
          }}
        >
          Enviar a Laura
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-composer.tsx
git commit -m "feat(web): add min-length validation and rotating placeholders to Laura composer"
```

---

### Task 13: SSE Streaming endpoint (backend)

**Files:**
- Modify: `apps/api/src/modules/laura/laura.controller.ts`

- [ ] **Step 1: Add SSE response option to sendMessage**

Add a new method to `LauraController`:

```typescript
import { Observable } from "rxjs";
import { Sse } from "@nestjs/common";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("administrador", "comercial", "director_comercial", "tecnico")
@Sse("messages/stream")
streamMessage(
  @CurrentUser() user: AuthUser,
  @Query("content") content: string,
  @Query("sessionId") sessionId?: string,
  @Query("contextType") contextType?: string,
  @Query("contextEntityId") contextEntityId?: string,
) {
  const dto = new CreateMessageDto();
  dto.content = content;
  dto.sessionId = sessionId;
  dto.contextType = contextType;
  dto.contextEntityId = contextEntityId;

  return new Observable((subscriber) => {
    this.lauraService
      .handleMessage(user, dto)
      .then((result) => {
        subscriber.next({ data: JSON.stringify(result) });
        subscriber.complete();
      })
      .catch((error) => {
        subscriber.next({ data: JSON.stringify({ mode: "error", message: error.message }) });
        subscriber.complete();
      });
  });
}
```

Note: Verify `@nestjs/common` has `@Sse` decorator. If not available in your NestJS version, use a custom SSE endpoint with `@Res()`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/laura/laura.controller.ts
git commit -m "feat(api): add SSE streaming endpoint for Laura messages"
```

---

### Task 14: Frontend — SSE streaming client

**Files:**
- Create: `apps/web/src/lib/laura-sse.client.ts`
- Modify: `apps/web/src/components/laura/laura-chat.tsx`

- [ ] **Step 1: Create SSE streaming utility**

Create `apps/web/src/lib/laura-sse.client.ts`:

```typescript
import { getSessionTokenClient } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function streamLauraMessage(
  payload: { sessionId?: string; content: string; contextType?: string; contextEntityId?: string },
  onEvent: (event: unknown) => void,
  onError: (error: Error) => void,
): AbortController {
  const controller = new AbortController();
  const token = getSessionTokenClient();
  const params = new URLSearchParams({ content: payload.content });
  if (payload.sessionId) params.set("sessionId", payload.sessionId);
  if (payload.contextType) params.set("contextType", payload.contextType);
  if (payload.contextEntityId) params.set("contextEntityId", payload.contextEntityId);

  const url = `${API_URL}/laura/messages/stream?${params.toString()}`;

  fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Laura streaming failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            try {
              onEvent(JSON.parse(data));
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      }
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.name !== "AbortError") {
        onError(error);
      }
    });

  return controller;
}
```

- [ ] **Step 2: Update laura-chat.tsx to try SSE first, fallback to JSON**

In `handleSend`, check if SSE is available and use it. For V1, keep JSON as the default and add SSE as opt-in:

```typescript
const USE_STREAMING = false; // Toggle when backend SSE is ready

async function handleSend(content: string) {
  // ... existing implementation unchanged for now
  // When streaming is ready, set USE_STREAMING = true and use streamLauraMessage
}
```

This keeps the current JSON flow working while making the SSE client available for future activation.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/laura-sse.client.ts apps/web/src/components/laura/laura-chat.tsx
git commit -m "feat(web): add SSE streaming client for Laura messages (opt-in)"
```

---

### Task 15: Frontend types sync with backend

**Files:**
- Modify: `apps/web/src/components/laura/laura-types.ts`

- [ ] **Step 1: Sync frontend types with backend changes**

Update `laura-types.ts` to include the new `scheduledAt` and `priorityGroup` fields on agenda items, and add the `LauraMessageStatus` type:

```typescript
export type LauraMessageStatus = "pending" | "confirmed" | "error";

export interface LauraAgendaItem {
  id: string;
  type: "visit" | "follow_up_task";
  label: string;
  scheduledAt?: string;
  priorityGroup?: number;
}

export interface LauraMessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  kind: string;
  content: string;
  createdAt: string;
  status?: LauraMessageStatus;
}
```

Update the `LauraAssistantResponse` agenda mode:

```typescript
| {
    mode: "agenda";
    sessionId: string;
    message: string;
    agenda: {
      items: LauraAgendaItem[];
    };
  };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-types.ts
git commit -m "feat(web): sync Laura frontend types with backend agenda priority and message status"
```

---

## Post-implementation verification

After all tasks are complete:

- [ ] **Run full backend test suite**
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/api test
```

- [ ] **Run full frontend type check**
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/web typecheck
```

- [ ] **Run Playwright e2e tests**
```bash
cd /Users/xstaked/Desktop/projects/norgtech-CRM/.worktrees/laura-task-1 && pnpm --filter @norgtech/web test:e2e
```

- [ ] **Verify OpenAI provider works with a manual test** (requires `OPENAI_API_KEY` set)

- [ ] **Merge laura-task-1 branch back to main**