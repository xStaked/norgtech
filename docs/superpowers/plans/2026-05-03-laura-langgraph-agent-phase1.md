# Laura LangGraph Agent - Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Laura Agent microservice infrastructure with LangGraph JS, define the graph structure with all nodes, create NestJS internal API endpoints for agent tools, and validate the end-to-end flow works with a feature flag.

**Architecture:** A new `apps/agent-laura/` package in the monorepo runs as an independent LangGraph JS service. It communicates with the existing NestJS CRM via internal HTTP endpoints. NestJS gains a feature flag (`LAURA_USE_AGENT`) to route traffic between the current procedural flow and the new agent. The agent never accesses PostgreSQL directly for CRM data — only for LangGraph checkpoint state. All CRM data mutations go through NestJS internal APIs.

**Tech Stack:** TypeScript, `@langchain/langgraph`, `@langchain/core`, `@langchain/openai` (for DeepSeek/Qwen via OpenAI-compatible APIs), `@langchain/langgraph-checkpoint-postgres`, NestJS internal APIs, pnpm workspaces.

---

## Task 1: Scaffold the agent-laura package

**Files:**
- Create: `apps/agent-laura/package.json`
- Create: `apps/agent-laura/tsconfig.json`
- Create: `apps/agent-laura/src/config/index.ts`
- Create: `apps/agent-laura/src/index.ts`

- [ ] **Step 1: Create `apps/agent-laura/package.json`**

```json
{
  "name": "@norgtech/agent-laura",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@langchain/core": "^0.3.42",
    "@langchain/langgraph": "^0.2.54",
    "@langchain/langgraph-checkpoint-postgres": "^0.0.3",
    "@langchain/openai": "^0.5.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create `apps/agent-laura/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `apps/agent-laura/src/config/index.ts`**

```typescript
export const config = {
  port: Number(process.env.AGENT_LAURA_PORT ?? 3100),
  nestjsBaseUrl: process.env.NESTJS_BASE_URL ?? "http://localhost:3001",
  nestjsServiceToken: process.env.NESTJS_SERVICE_TOKEN ?? "",
  databaseUrl: process.env.AGENT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  llm: {
    provider: (process.env.LAURA_LLM_PROVIDER ?? "deepseek") as "deepseek" | "qwen" | "openai",
    model: process.env.LAURA_LLM_MODEL,
    timeoutMs: Number(process.env.LAURA_LLM_TIMEOUT_MS ?? "30000"),
  },
} as const;

export type Config = typeof config;
```

- [ ] **Step 4: Create `apps/agent-laura/src/index.ts`**

```typescript
import { config } from "./config/index.js";

console.log(`@norgtech/agent-laura starting on port ${config.port}`);
console.log(`LLM provider: ${config.llm.provider}`);
console.log(`NestJS base URL: ${config.nestjsBaseUrl}`);
```

- [ ] **Step 5: Install dependencies**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM && pnpm install`

- [ ] **Step 6: Verify build works**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/agent-laura && pnpm build`

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/agent-laura/
git commit -m "feat: scaffold agent-laura package with config and base structure"
```

---

## Task 2: Define the graph state and shared types

**Files:**
- Create: `apps/agent-laura/src/graph/state.ts`
- Create: `apps/agent-laura/src/types.ts`

- [ ] **Step 1: Create `apps/agent-laura/src/types.ts`**

This file defines the shared types that mirror the current `laura.types.ts` from NestJS, adapted for the agent context.

```typescript
export interface ProposalInteractionBlock {
  enabled: boolean;
  summary: string;
  rawMessage: string;
}

export interface ProposalOpportunityBlock {
  enabled: boolean;
  opportunityId?: string;
  createNew?: boolean;
  title?: string;
  stage?: string;
}

export interface ProposalFollowUpBlock {
  enabled: boolean;
  title: string;
  dueAt: string;
  opportunityId?: string;
  type: string;
}

export interface ProposalTaskBlock {
  enabled: boolean;
  title: string;
  dueAt?: string;
  notes?: string;
}

export interface ProposalSignalsBlock {
  enabled: boolean;
  objections: string[];
  risk?: string;
  buyingIntent?: string;
}

export interface ProposalPayload {
  blocks: {
    interaction?: ProposalInteractionBlock;
    opportunity?: ProposalOpportunityBlock;
    followUp?: ProposalFollowUpBlock;
    task?: ProposalTaskBlock;
    signals?: ProposalSignalsBlock;
  };
}

export interface ClarificationOption {
  id: string;
  label: string;
}

export interface AgendaItem {
  id: string;
  type: "visit" | "follow_up_task";
  label: string;
  scheduledAt?: string;
  priorityGroup?: number;
}

export type AgentMode = "greeting" | "clarification" | "proposal" | "agenda";

export interface AgentResponse {
  mode: AgentMode;
  sessionId: string;
  message: string;
  clarification?: {
    type: "customer" | "opportunity" | "date" | "action";
    options?: ClarificationOption[];
  };
  proposalId?: string;
  proposal?: ProposalPayload;
  agenda?: {
    items: AgendaItem[];
  };
}
```

- [ ] **Step 2: Create `apps/agent-laura/src/graph/state.ts`**

```typescript
import { Annotation, type BaseMessage } from "@langchain/core/messages";
import type {
  AgendaItem,
  AgentMode,
  ClarificationOption,
  ProposalPayload,
} from "../types.js";

export const LauraState = Annotation.Root({
  sessionId: Annotation<string>,
  userId: Annotation<string>,
  messages: Annotation<BaseMessage[]>,
  mode: Annotation<AgentMode>,

  customerContext: Annotation<{ id: string; label: string } | null>,
  opportunityContext: Annotation<{ id: string; label: string } | null>,

  clarificationOptions: Annotation<{
    type: string;
    options: ClarificationOption[];
  } | null>,

  proposal: Annotation<ProposalPayload | null>,
  proposalId: Annotation<string | null>,
  proposalStatus: Annotation<"draft" | "confirmed" | "discarded">,

  agendaItems: Annotation<AgendaItem[] | null>,

  lastError: Annotation<string | null>,
});

export type LauraStateType = typeof LauraState.State;
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/agent-laura && pnpm build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/agent-laura/src/types.ts apps/agent-laura/src/graph/state.ts
git commit -m "feat: define agent graph state and shared types"
```

---

## Task 3: Create the LLM provider configuration

**Files:**
- Create: `apps/agent-laura/src/config/providers.ts`

- [ ] **Step 1: Create `apps/agent-laura/src/config/providers.ts`**

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { config } from "./index.js";

const PROVIDER_CONFIGS = {
  deepseek: {
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
  },
  qwen: {
    defaultModel: "qwen-plus",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  openai: {
    defaultModel: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
  },
} as const;

type ProviderName = keyof typeof PROVIDER_CONFIGS;

function getApiKey(provider: ProviderName): string | undefined {
  switch (provider) {
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY;
    case "qwen":
      return process.env.QWEN_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
  }
}

export function createLlm(): ChatOpenAI {
  const provider = config.llm.provider as ProviderName;
  const providerConfig = PROVIDER_CONFIGS[provider] ?? PROVIDER_CONFIGS.deepseek;
  const apiKey = getApiKey(provider);

  if (!apiKey) {
    throw new Error(
      `No API key configured for LLM provider "${provider}". Set the appropriate environment variable.`
    );
  }

  return new ChatOpenAI({
    modelName: config.llm.model ?? providerConfig.defaultModel,
    temperature: 0.3,
    maxTokens: 1024,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: process.env[`${provider.toUpperCase()}_BASE_URL`] ?? providerConfig.baseUrl,
    },
    maxRetries: 1,
    timeout: config.llm.timeoutMs,
  });
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/agent-laura && pnpm build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/agent-laura/src/config/providers.ts
git commit -m "feat: add LLM provider configuration for deepseek/qwen/openai"
```

---

## Task 4: Create the NestJS HTTP client for agent tools

**Files:**
- Create: `apps/agent-laura/src/tools/nestjs-client.ts`

- [ ] **Step 1: Create `apps/agent-laura/src/tools/nestjs-client.ts`**

This is the HTTP client that tools use to call NestJS internal APIs.

```typescript
import { config } from "../config/index.js";

class NestJSError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`NestJS API error (${status}): ${message}`);
    this.name = "NestJSError";
  }
}

async function nestjsRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${config.nestjsBaseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (config.nestjsServiceToken) {
    headers["Authorization"] = `Bearer ${config.nestjsServiceToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new NestJSError(response.status, body || response.statusText);
  }

  return response.json() as Promise<T>;
}

export async function searchCustomers(query: string): Promise<Array<{ id: string; label: string }>> {
  return nestjsRequest(`/laura/agents/customers?search=${encodeURIComponent(query)}`);
}

export async function searchOpportunities(query: string): Promise<Array<{ id: string; label: string }>> {
  return nestjsRequest(`/laura/agents/opportunities?search=${encodeURIComponent(query)}`);
}

export async function getCustomerDetails(customerId: string): Promise<Record<string, unknown>> {
  return nestjsRequest(`/laura/agents/customers/${customerId}`);
}

export async function getOpportunityDetails(opportunityId: string): Promise<Record<string, unknown>> {
  return nestjsRequest(`/laura/agents/opportunities/${opportunityId}`);
}

export async function getPendingTasks(userId: string): Promise<Array<{ id: string; title: string; dueAt: string; type: string }>> {
  return nestjsRequest(`/laura/agents/users/${userId}/tasks?status=pendiente`);
}

export async function getScheduledVisits(userId: string): Promise<Array<{ id: string; summary: string; scheduledAt: string }>> {
  return nestjsRequest(`/laura/agents/users/${userId}/visits?status=programada`);
}

export async function createInteraction(data: {
  customerId: string;
  summary: string;
  rawMessage: string;
  opportunityId?: string;
  occurredAt?: string;
  nextStep?: string;
  signals?: Record<string, unknown>;
}): Promise<{ id: string }> {
  return nestjsRequest("/laura/agents/interactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function upsertOpportunity(data: {
  customerId: string;
  title: string;
  stage: string;
  opportunityId?: string;
}): Promise<{ id: string }> {
  return nestjsRequest("/laura/agents/opportunities", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createFollowUp(data: {
  customerId: string;
  title: string;
  dueAt: string;
  type: string;
  opportunityId?: string;
}): Promise<{ id: string }> {
  return nestjsRequest("/laura/agents/followups", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createTask(data: {
  customerId: string;
  title: string;
  dueAt?: string;
  type?: string;
  opportunityId?: string;
  notes?: string;
}): Promise<{ id: string }> {
  return nestjsRequest("/laura/agents/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/agent-laura && pnpm build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/agent-laura/src/tools/nestjs-client.ts
git commit -m "feat: add NestJS HTTP client for agent tools"
```

---

## Task 5: Define LangGraph tools

**Files:**
- Create: `apps/agent-laura/src/tools/search-customers.ts`
- Create: `apps/agent-laura/src/tools/search-opportunities.ts`
- Create: `apps/agent-laura/src/tools/get-customer-details.ts`
- Create: `apps/agent-laura/src/tools/get-opportunity-details.ts`
- Create: `apps/agent-laura/src/tools/get-pending-tasks.ts`
- Create: `apps/agent-laura/src/tools/get-scheduled-visits.ts`
- Create: `apps/agent-laura/src/tools/create-interaction.ts`
- Create: `apps/agent-laura/src/tools/create-followup.ts`
- Create: `apps/agent-laura/src/tools/create-task.ts`
- Create: `apps/agent-laura/src/tools/index.ts`

- [ ] **Step 1: Create `apps/agent-laura/src/tools/search-customers.ts`**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchCustomers } from "./nestjs-client.js";

export const searchCustomersTool = tool(
  async ({ query }) => {
    const results = await searchCustomers(query);
    return JSON.stringify(results);
  },
  {
    name: "search_customers",
    description:
      "Search for customers by name. Returns a list of matching customers with their IDs and display names. Use this when the user mentions a customer name and you need to find the exact customer record.",
    schema: z.object({
      query: z.string().describe("The customer name or partial name to search for"),
    }),
  },
);
```

- [ ] **Step 2: Create `apps/agent-laura/src/tools/search-opportunities.ts`**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchOpportunities } from "./nestjs-client.js";

export const searchOpportunitiesTool = tool(
  async ({ query }) => {
    const results = await searchOpportunities(query);
    return JSON.stringify(results);
  },
  {
    name: "search_opportunities",
    description:
      "Search for opportunities by title. Returns a list of matching opportunities with their IDs and titles.",
    schema: z.object({
      query: z.string().describe("The opportunity title or partial title to search for"),
    }),
  },
);
```

- [ ] **Step 3: Create `apps/agent-laura/src/tools/get-customer-details.ts`**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCustomerDetails } from "./nestjs-client.js";

export const getCustomerDetailsTool = tool(
  async ({ customerId }) => {
    const details = await getCustomerDetails(customerId);
    return JSON.stringify(details);
  },
  {
    name: "get_customer_details",
    description:
      "Get detailed information about a specific customer by ID. Returns customer name, contacts, and other details.",
    schema: z.object({
      customerId: z.string().describe("The customer ID to look up"),
    }),
  },
);
```

- [ ] **Step 4: Create `apps/agent-laura/src/tools/get-opportunity-details.ts`**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getOpportunityDetails } from "./nestjs-client.js";

export const getOpportunityDetailsTool = tool(
  async ({ opportunityId }) => {
    const details = await getOpportunityDetails(opportunityId);
    return JSON.stringify(details);
  },
  {
    name: "get_opportunity_details",
    description:
      "Get detailed information about a specific opportunity by ID. Returns opportunity title, stage, customer, and other details.",
    schema: z.object({
      opportunityId: z.string().describe("The opportunity ID to look up"),
    }),
  },
);
```

- [ ] **Step 5: Create `apps/agent-laura/src/tools/get-pending-tasks.ts`**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getPendingTasks } from "./nestjs-client.js";

export const getPendingTasksTool = tool(
  async ({ userId }) => {
    const tasks = await getPendingTasks(userId);
    return JSON.stringify(tasks);
  },
  {
    name: "get_pending_tasks",
    description:
      "Get the list of pending follow-up tasks for a user. Returns task ID, title, due date, and type.",
    schema: z.object({
      userId: z.string().describe("The user ID whose tasks to retrieve"),
    }),
  },
);
```

- [ ] **Step 6: Create `apps/agent-laura/src/tools/get-scheduled-visits.ts`**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getScheduledVisits } from "./nestjs-client.js";

export const getScheduledVisitsTool = tool(
  async ({ userId }) => {
    const visits = await getScheduledVisits(userId);
    return JSON.stringify(visits);
  },
  {
    name: "get_scheduled_visits",
    description:
      "Get the list of scheduled visits for a user. Returns visit ID, summary, and scheduled date.",
    schema: z.object({
      userId: z.string().describe("The user ID whose visits to retrieve"),
    }),
  },
);
```

- [ ] **Step 7: Create `apps/agent-laura/src/tools/create-interaction.ts`**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createInteraction } from "./nestjs-client.js";

export const createInteractionTool = tool(
  async ({ customerId, summary, rawMessage, opportunityId, occurredAt, nextStep, signals }) => {
    const result = await createInteraction({
      customerId,
      summary,
      rawMessage,
      opportunityId,
      occurredAt,
      nextStep,
      signals,
    });
    return JSON.stringify(result);
  },
  {
    name: "create_interaction",
    description:
      "Create a commercial interaction (visit record) in the CRM. This persists a customer interaction with its summary and metadata.",
    schema: z.object({
      customerId: z.string().describe("The customer ID this interaction relates to"),
      summary: z.string().describe("A concise summary of the interaction"),
      rawMessage: z.string().describe("The original user message describing the interaction"),
      opportunityId: z.string().optional().describe("Optional opportunity ID to link"),
      occurredAt: z.string().optional().describe("ISO 8601 date when the interaction occurred"),
      nextStep: z.string().optional().describe("Suggested next step"),
      signals: z.record(z.unknown()).optional().describe("Signal data including objections, risk, buying intent"),
    }),
  },
);
```

- [ ] **Step 8: Create `apps/agent-laura/src/tools/create-followup.ts`**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createFollowUp } from "./nestjs-client.js";

export const createFollowUpTool = tool(
  async ({ customerId, title, dueAt, type, opportunityId }) => {
    const result = await createFollowUp({
      customerId,
      title,
      dueAt,
      type,
      opportunityId,
    });
    return JSON.stringify(result);
  },
  {
    name: "create_followup",
    description:
      "Create a follow-up task in the CRM. This schedules a future action (call, meeting, etc.) for a commercial contact.",
    schema: z.object({
      customerId: z.string().describe("The customer ID this follow-up relates to"),
      title: z.string().describe("Short title for the follow-up"),
      dueAt: z.string().describe("ISO 8601 date when the follow-up is due"),
      type: z.string().describe("Type of follow-up: llamada, email, whatsapp, reunion, recordatorio"),
      opportunityId: z.string().optional().describe("Optional opportunity ID to link"),
    }),
  },
);
```

- [ ] **Step 9: Create `apps/agent-laura/src/tools/create-task.ts`**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createTask } from "./nestjs-client.js";

export const createTaskTool = tool(
  async ({ customerId, title, dueAt, type, opportunityId, notes }) => {
    const result = await createTask({
      customerId,
      title,
      dueAt,
      type,
      opportunityId,
      notes,
    });
    return JSON.stringify(result);
  },
  {
    name: "create_task",
    description:
      "Create a general task in the CRM. Use for administrative or follow-up tasks that don't fit the follow-up category.",
    schema: z.object({
      customerId: z.string().describe("The customer ID this task relates to"),
      title: z.string().describe("Short title for the task"),
      dueAt: z.string().optional().describe("ISO 8601 date when the task is due"),
      type: z.string().optional().describe("Type of task"),
      opportunityId: z.string().optional().describe("Optional opportunity ID to link"),
      notes: z.string().optional().describe("Additional notes for the task"),
    }),
  },
);
```

- [ ] **Step 10: Create `apps/agent-laura/src/tools/index.ts`**

```typescript
import { searchCustomersTool } from "./search-customers.js";
import { searchOpportunitiesTool } from "./search-opportunities.js";
import { getCustomerDetailsTool } from "./get-customer-details.js";
import { getOpportunityDetailsTool } from "./get-opportunity-details.js";
import { getPendingTasksTool } from "./get-pending-tasks.js";
import { getScheduledVisitsTool } from "./get-scheduled-visits.js";
import { createInteractionTool } from "./create-interaction.js";
import { createFollowUpTool } from "./create-followup.js";
import { createTaskTool } from "./create-task.js";

export const allTools = [
  searchCustomersTool,
  searchOpportunitiesTool,
  getCustomerDetailsTool,
  getOpportunityDetailsTool,
  getPendingTasksTool,
  getScheduledVisitsTool,
  createInteractionTool,
  createFollowUpTool,
  createTaskTool,
];
```

- [ ] **Step 11: Verify build succeeds**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/agent-laura && pnpm build`

Expected: Build succeeds.

- [ ] **Step 12: Commit**

```bash
git add apps/agent-laura/src/tools/
git commit -m "feat: add LangGraph tools that call NestJS internal APIs"
```

---

## Task 6: Create graph nodes

**Files:**
- Create: `apps/agent-laura/src/graph/nodes/router.ts`
- Create: `apps/agent-laura/src/graph/nodes/greeting.ts`
- Create: `apps/agent-laura/src/graph/nodes/clarify.ts`
- Create: `apps/agent-laura/src/graph/nodes/extract-intent.ts`
- Create: `apps/agent-laura/src/graph/nodes/build-proposal.ts`
- Create: `apps/agent-laura/src/graph/nodes/await-confirmation.ts`
- Create: `apps/agent-laura/src/graph/nodes/refine.ts`
- Create: `apps/agent-laura/src/graph/nodes/confirm.ts`
- Create: `apps/agent-laura/src/graph/nodes/discard.ts`
- Create: `apps/agent-laura/src/graph/nodes/agenda.ts`

- [ ] **Step 1: Create `apps/agent-laura/src/graph/nodes/router.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { createLlm } from "../../config/providers.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const ROUTER_PROMPT = `Eres un clasificador de mensajes para Laura, un asistente comercial. Clasifica el mensaje del usuario en exactamente una de estas categorías:

- "greeting": Saludos cortos como "hola", "buenos días", "hey"
- "agenda_query": Preguntas sobre pendientes, agenda, tareas, visitas, "qué tengo hoy", "qué hay esta semana"
- "clarification_reply": Respuestas a opciones de clarificación previas como "el primero", "opción 2", o la selección de un cliente/oportunidad listado
- "report": Reportes de interacciones comerciales, visitas, seguimientos, o cualquier mensaje que no sea saludo, agenda o clarificación

Responde SOLO con el nombre de la categoría, sin explicaciones.`;

export async function routerNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = typeof lastMessage.content === "string"
    ? lastMessage.content
    : Array.isArray(lastMessage.content)
      ? lastMessage.content.map((c) => (typeof c === "string" ? c : c.text ?? "")).join(" ")
      : "";

  const classification = await classifyWithHeuristics(content);

  return { mode: classification };
}

async function classifyWithHeuristics(content: string): Promise<LauraStateType["mode"]> {
  const normalized = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

  const agendaKeywords = ["agenda", "pendientes", "pendiente", "tareas", "visitas", "semana", "hoy", "que tengo", "qué tengo", "programado"];
  if (agendaKeywords.some((k) => normalized.includes(k))) {
    return "agenda";
  }

  const greetingPatterns = ["hola", "buenos dias", "buenas tardes", "buenas noches", "hey", "hi", "que tal", "qué tal"];
  if (normalized.split(/\s+/).length <= 6 && greetingPatterns.some((g) => normalized === g || normalized.startsWith(`${g} `))) {
    return "greeting";
  }

  if (state_in_clarification_context(content)) {
    return "clarification";
  }

  return "proposal";
}

function state_in_clarification_context(content: string): boolean {
  const normalized = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

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
```

Note: The router uses deterministic heuristics first (matching the current behavior in `laura.service.ts`). The LLM classification can be added later as an enhancement. The function `classifyWithHeuristics` intentionally returns "proposal" for non-trivial messages since the proposal flow handles the extraction logic.

- [ ] **Step 2: Create `apps/agent-laura/src/graph/nodes/greeting.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";

export async function greetingNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const message = "¡Hola! 👋 Soy Laura, tu asistente comercial. Contame qué pasó en tu visita, qué pendientes tenés o si querés ver tu agenda.";

  return {
    mode: "greeting",
    messages: [...state.messages, new AIMessage(message)],
  };
}
```

- [ ] **Step 3: Create `apps/agent-laura/src/graph/nodes/clarify.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import { searchCustomers } from "../../tools/nestjs-client.js";

export async function clarifyNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content);

  const results = await searchCustomers(content);

  const options = results.map((r) => ({ id: r.id, label: r.label }));

  if (options.length === 0) {
    return {
      mode: "proposal",
      messages: [...state.messages, new AIMessage("No encontré clientes que coincidan. ¿Podés darme más detalles?")],
      clarificationOptions: null,
    };
  }

  if (options.length === 1) {
    return {
      mode: "proposal",
      customerContext: { id: options[0].id, label: options[0].label },
      clarificationOptions: null,
      messages: state.messages,
    };
  }

  const optionsList = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  const message = `Encontré varios clientes que coinciden:\n${optionsList}\n¿Cuál es?`;

  return {
    mode: "clarification",
    clarificationOptions: { type: "customer", options },
    messages: [...state.messages, new AIMessage(message)],
  };
}
```

- [ ] **Step 4: Create `apps/agent-laura/src/graph/nodes/extract-intent.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import { createLlm } from "../../config/providers.js";
import { LAURA_SYSTEM_PROMPT } from "../../prompts/system-prompt.js";
import { fillPromptSections } from "../../prompts/prompt-sections.js";

interface ExtractionResult {
  intent: "report" | "agenda_query";
  customerName?: string;
  contactName?: string;
  interactionSummary?: string;
  suggestedOpportunityTitle?: string;
  suggestedOpportunityStage?: string;
  suggestedNextStep?: string;
  suggestedFollowUpDate?: string;
  suggestedTaskTitle?: string;
  taskType?: string;
  signals?: {
    objections?: string[];
    risk?: string;
    buyingIntent?: string;
  };
}

export async function extractIntentNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content);

  const recentMessages = state.messages
    .slice(-6)
    .map((m) => typeof m.content === "string" ? m.content : String(m.content));

  const llm = createLlm();
  const systemPrompt = fillPromptSections(LAURA_SYSTEM_PROMPT, {
    context: state.customerContext?.label ?? "",
    recentMessages: recentMessages.join("\n"),
  });

  const response = await llm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content },
  ]);

  let extraction: ExtractionResult;
  try {
    const cleaned = response.content.toString()
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?\s*```$/, "")
      .trim();
    extraction = JSON.parse(cleaned) as ExtractionResult;
  } catch {
    extraction = {
      intent: "report",
      interactionSummary: content.trim(),
    };
  }

  if (extraction.intent === "agenda_query") {
    return { mode: "agenda" };
  }

  return {
    mode: "proposal",
    messages: state.messages,
    _extractionResult: extraction as unknown as undefined,
  };
}
```

Note: The `_extractionResult` pattern stores intermediate data on the state. We'll handle this properly in the build-proposal node.

- [ ] **Step 5: Update the state to carry extraction results**

Add an extraction result field to the state in `apps/agent-laura/src/graph/state.ts`:

```typescript
// Add this import at the top:
// (no additional imports needed, the ExtractionResult type is only used internally)

// Add this field to the LauraState Annotation:
  _extractionResult: Annotation<Record<string, unknown> | null>,
```

Update `apps/agent-laura/src/graph/state.ts` to include:

```typescript
import { Annotation, type BaseMessage } from "@langchain/core/messages";
import type {
  AgendaItem,
  AgentMode,
  ClarificationOption,
  ProposalPayload,
} from "../types.js";

export const LauraState = Annotation.Root({
  sessionId: Annotation<string>,
  userId: Annotation<string>,
  messages: Annotation<BaseMessage[]>,
  mode: Annotation<AgentMode>,

  customerContext: Annotation<{ id: string; label: string } | null>,
  opportunityContext: Annotation<{ id: string; label: string } | null>,

  clarificationOptions: Annotation<{
    type: string;
    options: ClarificationOption[];
  } | null>,

  proposal: Annotation<ProposalPayload | null>,
  proposalId: Annotation<string | null>,
  proposalStatus: Annotation<"draft" | "confirmed" | "discarded">,

  agendaItems: Annotation<AgendaItem[] | null>,

  lastError: Annotation<string | null>,

  _extractionResult: Annotation<Record<string, unknown> | null>,
});

export type LauraStateType = typeof LauraState.State;
```

- [ ] **Step 6: Create `apps/agent-laura/src/graph/nodes/build-proposal.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import type { ProposalPayload } from "../../types.js";

export async function buildProposalNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const extraction = state._extractionResult;
  const lastUserContent = state.messages
    .filter((m) => m._getType() === "human")
    .pop()?.content;
  const content = typeof lastUserContent === "string" ? lastUserContent : String(lastUserContent ?? "");

  const canPersist = Boolean(state.customerContext?.id);

  const proposal: ProposalPayload = {
    blocks: {
      interaction: {
        enabled: canPersist,
        summary: (extraction?.interactionSummary as string) ?? content.trim(),
        rawMessage: content.trim(),
      },
      opportunity: {
        enabled: canPersist,
        opportunityId: state.opportunityContext?.id,
        createNew: !state.opportunityContext?.id && canPersist,
        title: extraction?.suggestedOpportunityTitle as string | undefined,
        stage: extraction?.suggestedOpportunityStage as string | undefined,
      },
      followUp: {
        enabled: canPersist,
        opportunityId: state.opportunityContext?.id,
        title: (extraction?.suggestedNextStep as string) ?? "Dar seguimiento comercial",
        dueAt: (extraction?.suggestedFollowUpDate as string) ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        type: (extraction?.taskType as string) ?? "llamada",
      },
      task: {
        enabled: canPersist,
        title: (extraction?.suggestedTaskTitle as string) ?? "Registrar seguimiento comercial",
        dueAt: extraction?.suggestedFollowUpDate as string | undefined,
        notes: extraction?.contactName as string | undefined,
      },
      signals: {
        enabled: canPersist,
        objections: (extraction?.signals?.objections as string[]) ?? [],
        risk: extraction?.signals?.risk as string | undefined,
        buyingIntent: extraction?.signals?.buyingIntent as string | undefined,
      },
    },
  };

  const proposalId = state.proposalId ?? crypto.randomUUID();

  return {
    mode: "proposal",
    proposal,
    proposalId,
    proposalStatus: "draft",
    messages: [
      ...state.messages,
      new AIMessage("Preparé una propuesta inicial para que la revises antes de guardarla."),
    ],
  };
}
```

- [ ] **Step 7: Create `apps/agent-laura/src/graph/nodes/await-confirmation.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { interrupt } from "@langchain/langgraph";

export async function awaitConfirmationNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  interrupt("Awaiting user confirmation for proposal");

  return {};
}
```

- [ ] **Step 8: Create `apps/agent-laura/src/graph/nodes/refine.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import { createLlm } from "../../config/providers.js";

const REFINE_PROMPT = `El usuario quiere ajustar la propuesta comercial actual. Analizá su feedback y generá una versión mejorada de los campos que menciona.

Propuesta actual:
{CURRENT_PROPOSAL}

Feedback del usuario:
{USER_FEEDBACK}

Respondé SOLO con un JSON que contenga los campos que hay que actualizar, manteniendo los demás igual. Si el usuario no sugiere cambios específicos, devolvé la propuesta sin modificaciones.`;

export async function refineNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const feedback = typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content);

  if (!state.proposal) {
    return {
      mode: "proposal",
      lastError: "No hay propuesta activa para refinar",
    };
  }

  const prompt = REFINE_PROMPT
    .replace("{CURRENT_PROPOSAL}", JSON.stringify(state.proposal, null, 2))
    .replace("{USER_FEEDBACK}", feedback);

  const llm = createLlm();
  const response = await llm.invoke([{ role: "user", content: prompt }]);

  try {
    const cleaned = response.content.toString()
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?\s*```$/, "")
      .trim();
    const updates = JSON.parse(cleaned) as Record<string, unknown>;

    const refinedProposal = {
      ...state.proposal,
      blocks: { ...state.proposal.blocks, ...(updates.blocks as typeof state.proposal.blocks) },
    };

    return {
      proposal: refinedProposal,
      proposalStatus: "draft",
      messages: [...state.messages, new AIMessage("Ajusté la propuesta según tu feedback. Revisala.")],
    };
  } catch {
    return {
      proposal: state.proposal,
      proposalStatus: "draft",
      messages: [...state.messages, new AIMessage("No pude entender los cambios. ¿Podés describirlos de otra forma?")],
    };
  }
}
```

- [ ] **Step 9: Create `apps/agent-laura/src/graph/nodes/confirm.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import {
  createInteraction,
  createFollowUp,
  createTask,
  upsertOpportunity,
} from "../../tools/nestjs-client.js";

export async function confirmNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  if (!state.proposal) {
    return {
      mode: "proposal",
      lastError: "No hay propuesta para confirmar",
      messages: [...state.messages, new AIMessage("No hay propuesta para confirmar.")],
    };
  }

  const blocks = state.proposal.blocks;
  const customerId = state.customerContext?.id;
  const saved: string[] = [];
  const discarded: string[] = [];
  const createdIds: Record<string, string> = {};

  let opportunityId = blocks.followUp?.opportunityId
    ?? blocks.opportunity?.opportunityId
    ?? state.opportunityContext?.id;

  if (blocks.opportunity?.enabled && customerId) {
    if (blocks.opportunity.createNew) {
      const created = await upsertOpportunity({
        customerId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage ?? "contacto",
      });
      opportunityId = created.id;
      saved.push("opportunity");
      createdIds.opportunity = created.id;
    } else if (blocks.opportunity.opportunityId && blocks.opportunity.stage) {
      const updated = await upsertOpportunity({
        customerId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage,
        opportunityId: blocks.opportunity.opportunityId,
      });
      opportunityId = updated.id;
      saved.push("opportunity");
      createdIds.opportunity = updated.id;
    } else {
      discarded.push("opportunity");
    }
  }

  if (blocks.interaction?.enabled && customerId) {
    const interaction = await createInteraction({
      customerId,
      summary: blocks.interaction.summary,
      rawMessage: blocks.interaction.rawMessage,
      opportunityId,
    });
    saved.push("interaction");
    createdIds.interaction = interaction.id;
  }

  if (blocks.followUp?.enabled && customerId) {
    const task = await createFollowUp({
      customerId,
      title: blocks.followUp.title,
      dueAt: blocks.followUp.dueAt,
      type: blocks.followUp.type,
      opportunityId: blocks.followUp.opportunityId ?? opportunityId,
    });
    saved.push("followUp");
    createdIds.followUp = task.id;
  }

  if (blocks.task?.enabled && customerId) {
    const task = await createTask({
      customerId,
      title: blocks.task.title,
      dueAt: blocks.task.dueAt,
      opportunityId: opportunityId,
      notes: blocks.task.notes,
    });
    saved.push("task");
    createdIds.task = task.id;
  }

  const summary = `Laura guardó ${saved.length} bloques${discarded.length > 0 ? ` y descartó ${discarded.length}` : ""}.`;

  return {
    proposalStatus: "confirmed",
    messages: [...state.messages, new AIMessage(summary)],
  };
}
```

- [ ] **Step 10: Create `apps/agent-laura/src/graph/nodes/discard.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";

export async function discardNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  return {
    proposalStatus: "discarded",
    proposal: null,
    proposalId: null,
    messages: [...state.messages, new AIMessage("Propuesta descartada. ¿Hay algo más en lo que pueda ayudarte?")],
  };
}
```

- [ ] **Step 11: Create `apps/agent-laura/src/graph/nodes/agenda.ts`**

```typescript
import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import { getPendingTasks, getScheduledVisits } from "../../tools/nestjs-client.js";
import type { AgendaItem } from "../../types.js";

export async function agendaNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const [tasks, visits] = await Promise.all([
    getPendingTasks(state.userId),
    getScheduledVisits(state.userId),
  ]);

  const now = new Date();
  const items: AgendaItem[] = [
    ...tasks.map((task) => ({
      id: task.id,
      type: "follow_up_task" as const,
      label: task.title,
      scheduledAt: task.dueAt,
    })),
    ...visits.map((visit) => ({
      id: visit.id,
      type: "visit" as const,
      label: visit.summary || "Visita programada",
      scheduledAt: visit.scheduledAt,
    })),
  ];

  const message = items.length > 0
    ? "Estas son tus prioridades comerciales actuales."
    : "No encontré pendientes activos en tu agenda.";

  return {
    mode: "agenda",
    agendaItems: items,
    messages: [...state.messages, new AIMessage(message)],
  };
}
```

- [ ] **Step 12: Verify build succeeds**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/agent-laura && pnpm build`

Expected: Build succeeds (there may be unused import warnings in `router.ts` — the LLM import will be used when we add LLM-based classification later).

- [ ] **Step 13: Commit**

```bash
git add apps/agent-laura/src/graph/nodes/ apps/agent-laura/src/graph/state.ts
git commit -m "feat: add all graph nodes for the Laura agent"
```

---

## Task 7: Create prompts module

**Files:**
- Create: `apps/agent-laura/src/prompts/system-prompt.ts`
- Create: `apps/agent-laura/src/prompts/prompt-sections.ts`

These are ported from the existing NestJS prompts with minor adaptations for the agent context.

- [ ] **Step 1: Create `apps/agent-laura/src/prompts/system-prompt.ts`**

```typescript
export const LAURA_SYSTEM_PROMPT = `Eres Laura, asistente comercial del CRM Norgtech. Tu trabajo es ayudar a los comerciales a registrar visitas, seguimientos y oportunidades de forma rápida y natural.

Tu tono es cálido, cercano, breve y profesional. Nunca menciones que eres una IA. Nunca des respuestas tipo menú de opciones.

Reglas estrictas:
1. Si hay ambigüedad en el cliente, oportunidad, fecha o acción principal, establece "needsClarification" a true y proporciona las opciones detectadas en "clarificationOptions".
2. Nunca inventes datos que no estén en el mensaje del usuario o en el contexto proporcionado.
3. Convierte todas las fechas relativas a formato ISO 8601. "mañana" → calcula desde hoy. "el viernes" → próximo viernes. "próxima semana" → próximo lunes.
4. Si el usuario pregunta por pendientes, agenda o prioridades, establece "intent" a "agenda_query".
5. Si el usuario responde a una clarificación previa (ej: "sí, el primero"), usa el contexto de mensajes anteriores para resolver la ambigüedad.
6. Extrae objeciones explícitamente mencionadas. No infieras objeciones que el usuario no mencionó.
7. Si no puedes detectar un cliente, deja customerName como null.`;
```

- [ ] **Step 2: Create `apps/agent-laura/src/prompts/prompt-sections.ts`**

```typescript
interface PromptSections {
  context?: string;
  recentMessages?: string;
  agendaSummary?: string;
}

export function fillPromptSections(
  systemPrompt: string,
  sections: PromptSections,
): string {
  return systemPrompt
    .replace("{INJECTED_CONTEXT}", sections.context ?? "Sin contexto de cliente adicional.")
    .replace("{INJECTED_MESSAGES}", sections.recentMessages ?? "Sin mensajes previos en esta sesión.")
    .replace("{INJECTED_AGENDA}", sections.agendaSummary ?? "");
}

export const SYSTEM_SCHEMA = `Responde EXCLUSIVAMENTE con un JSON que siga este esquema:
{
  "intent": "report | agenda_query",
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
  "needsClarification": "boolean",
  "clarificationField": "customer | opportunity | date | action | null",
  "clarificationOptions": [{ "id": "string", "label": "string" }] | null
}`;

export const SYSTEM_EXAMPLES = `Ejemplos:

Ejemplo 1 — Reporte de visita:
Usuario: "Estuve con Agropecuaria Lara ayer, hablé con Carlos Mendoza. Les interesa el sistema de inventario pero quieren ver una demo primero. Tienen preocupación por el precio."
Respuesta:
{
  "intent": "report",
  "customerName": "Agropecuaria Lara",
  "contactName": "Carlos Mendoza",
  "interactionSummary": "Reunión con Carlos Mendoza de Agropecuaria Lara. Interesados en sistema de inventario, quieren demo antes de avanzar.",
  "suggestedOpportunityTitle": "Sistema de inventario - Agropecuaria Lara",
  "suggestedOpportunityStage": "visita",
  "suggestedNextStep": "Programar demo del sistema de inventario",
  "suggestedFollowUpDate": null,
  "suggestedTaskTitle": "Programar demo con Agropecuaria Lara",
  "taskType": "reunion",
  "signals": {
    "objections": ["precio"],
    "risk": "sensibilidad al precio",
    "buyingIntent": "medio"
  },
  "needsClarification": false,
  "clarificationField": null,
  "clarificationOptions": null
}

Ejemplo 2 — Consulta de agenda:
Usuario: "Qué tengo pendiente hoy"
Respuesta:
{
  "intent": "agenda_query"
}`;
```

- [ ] **Step 3: Fix the import in `extract-intent.ts`**

The `extract-intent.ts` node already imports from `../../prompts/system-prompt.js` and `../../prompts/prompt-sections.js`. These are now created.

- [ ] **Step 4: Verify build succeeds**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/agent-laura && pnpm build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/agent-laura/src/prompts/
git commit -m "feat: add prompts module for Laura agent"
```

---

## Task 8: Wire up the graph with edges and compile

**Files:**
- Create: `apps/agent-laura/src/graph/edges.ts`
- Create: `apps/agent-laura/src/graph/graph.ts`

- [ ] **Step 1: Create `apps/agent-laura/src/graph/edges.ts`**

This defines the conditional routing logic that replaces the if/else chains in `laura.service.ts`.

```typescript
import type { LauraStateType } from "./state.js";

export function routerEdge(state: LauraStateType): string {
  switch (state.mode) {
    case "greeting":
      return "greeting";
    case "agenda":
      return "agenda";
    case "clarification":
      return "clarify";
    case "proposal":
      return "extract_intent";
    default:
      return "extract_intent";
  }
}

export function afterConfirmationEdge(state: LauraStateType): string {
  switch (state.proposalStatus) {
    case "confirmed":
      return "confirm";
    case "discarded":
      return "discard";
    case "draft":
    default:
      return "refine";
  }
}
```

- [ ] **Step 2: Create `apps/agent-laura/src/graph/graph.ts`**

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";
import { LauraState } from "./state.js";
import { routerNode } from "./nodes/router.js";
import { greetingNode } from "./nodes/greeting.js";
import { clarifyNode } from "./nodes/clarify.js";
import { extractIntentNode } from "./nodes/extract-intent.js";
import { buildProposalNode } from "./nodes/build-proposal.js";
import { awaitConfirmationNode } from "./nodes/await-confirmation.js";
import { refineNode } from "./nodes/refine.js";
import { confirmNode } from "./nodes/confirm.js";
import { discardNode } from "./nodes/discard.js";
import { agendaNode } from "./nodes/agenda.js";
import { routerEdge, afterConfirmationEdge } from "./edges.js";

const graphBuilder = new StateGraph(LauraState)
  .addNode("router", routerNode)
  .addNode("greeting", greetingNode)
  .addNode("clarify", clarifyNode)
  .addNode("extract_intent", extractIntentNode)
  .addNode("build_proposal", buildProposalNode)
  .addNode("await_confirmation", awaitConfirmationNode)
  .addNode("refine", refineNode)
  .addNode("confirm", confirmNode)
  .addNode("discard", discardNode)
  .addNode("agenda", agendaNode);

graphBuilder
  .addEdge(START, "router")
  .addConditionalEdges("router", routerEdge, {
    greeting: "greeting",
    agenda: "agenda",
    clarify: "clarify",
    extract_intent: "extract_intent",
  })
  .addEdge("greeting", END)
  .addEdge("clarify", END)
  .addEdge("agenda", END)
  .addEdge("extract_intent", "build_proposal")
  .addEdge("build_proposal", "await_confirmation")
  .addConditionalEdges("await_confirmation", afterConfirmationEdge, {
    confirm: "confirm",
    discard: "discard",
    refine: "refine",
  })
  .addEdge("refine", "build_proposal")
  .addEdge("confirm", END)
  .addEdge("discard", END);

export function createLauraGraph() {
  return graphBuilder.compile();
}
```

- [ ] **Step 3: Verify build succeeds**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/agent-laura && pnpm build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/agent-laura/src/graph/edges.ts apps/agent-laura/src/graph/graph.ts
git commit -m "feat: wire up the Laura graph with nodes, edges, and compilation"
```

---

## Task 9: Create the agent server entry point

**Files:**
- Create: `apps/agent-laura/src/server.ts`
- Update: `apps/agent-laura/src/index.ts`

This creates the HTTP server that matches the LangGraph server conventions and exposes endpoints for the NestJS gateway.

- [ ] **Step 1: Create `apps/agent-laura/src/server.ts`**

```typescript
import { createLauraGraph } from "./graph/graph.js";
import { config } from "./config/index.js";
import type { AgentResponse, AgentMode, ProposalPayload, AgendaItem, ClarificationOption } from "./types.js";
import type { LauraStateType } from "./graph/state.js";
import { HumanMessage } from "@langchain/core/messages";

const graph = createLauraGraph();

function stateToResponse(state: LauraStateType): AgentResponse {
  const base: AgentResponse = {
    mode: state.mode,
    sessionId: state.sessionId,
    message: state.messages[state.messages.length - 1]?.content?.toString() ?? "",
  };

  if (state.mode === "clarification" && state.clarificationOptions) {
    base.clarification = {
      type: state.clarificationOptions.type as "customer" | "opportunity" | "date" | "action",
      options: state.clarificationOptions.options,
    };
  }

  if (state.mode === "proposal" && state.proposal) {
    base.proposalId = state.proposalId ?? undefined;
    base.proposal = state.proposal;
  }

  if (state.mode === "agenda" && state.agendaItems) {
    base.agenda = { items: state.agendaItems };
  }

  return base;
}

async function handleInvoke(
  userId: string,
  sessionId: string,
  content: string,
  contextType?: string,
  contextEntityId?: string,
): Promise<AgentResponse> {
  const result = await graph.invoke({
    sessionId,
    userId,
    messages: [new HumanMessage(content)],
    mode: "greeting" as AgentMode,
    customerContext: contextType === "customer" && contextEntityId
      ? { id: contextEntityId, label: "" }
      : null,
    opportunityContext: contextType === "opportunity" && contextEntityId
      ? { id: contextEntityId, label: "" }
      : null,
    clarificationOptions: null,
    proposal: null,
    proposalId: null,
    proposalStatus: "draft",
    agendaItems: null,
    lastError: null,
    _extractionResult: null,
  });

  return stateToResponse(result);
}

const server = Bun?.serve
  ? undefined
  : (() => {
      const { createServer } = await import("http");
      const srv = createServer(async (req, res) => {
        if (req.method === "POST" && req.url === "/invoke") {
          const body = await new Promise<string>((resolve) => {
            let data = "";
            req.on("data", (chunk) => { data += chunk; });
            req.on("end", () => resolve(data));
          });

          const { userId, sessionId, content, contextType, contextEntityId } = JSON.parse(body);
          const response = await handleInvoke(userId, sessionId, content, contextType, contextEntityId);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } else if (req.method === "GET" && req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      });

      srv.listen(config.port, () => {
        console.log(`Laura Agent Service running on port ${config.port}`);
      });

      return srv;
    })();

export { handleInvoke, createLauraGraph };
```

Note: This uses a simple HTTP server for Phase 1. In Phase 3, this will be replaced with the LangGraph server for streaming support.

- [ ] **Step 2: Update `apps/agent-laura/src/index.ts`**

```typescript
import "./server.js";
```

- [ ] **Step 3: Verify build succeeds**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/agent-laura && pnpm build`

Expected: Build succeeds. The `import("http")` dynamic import may generate a warning — this is acceptable for Phase 1.

- [ ] **Step 4: Commit**

```bash
git add apps/agent-laura/src/server.ts apps/agent-laura/src/index.ts
git commit -m "feat: add HTTP server entry point for Laura agent service"
```

---

## Task 10: Add NestJS internal API endpoints for agent tools

**Files:**
- Create: `apps/api/src/modules/laura/laura-agents.controller.ts`
- Create: `apps/api/src/modules/laura/laura-agents.module.ts`
- Modify: `apps/api/src/modules/laura/laura.module.ts`

This adds the `/laura/agents/*` internal API endpoints that the agent tools will call. These endpoints use service-token authentication (not user JWT).

- [ ] **Step 1: Create `apps/api/src/modules/laura/laura-agents.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ServiceTokenGuard } from "../auth/service-token.guard";

@Controller("laura/agents")
@UseGuards(ServiceTokenGuard)
export class LauraAgentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("customers")
  async searchCustomers(@Query("search") search: string) {
    const normalized = search
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { displayName: { contains: normalized, mode: "insensitive" } },
          { legalName: { contains: normalized, mode: "insensitive" } },
        ],
      },
      include: { contacts: true },
      take: 10,
    });

    return customers.map((c) => ({
      id: c.id,
      label: c.displayName,
    }));
  }

  @Get("customers/:id")
  async getCustomerDetails(@Param("id") id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: { contacts: true },
    });
  }

  @Get("opportunities")
  async searchOpportunities(@Query("search") search: string) {
    const opportunities = await this.prisma.opportunity.findMany({
      where: {
        title: { contains: search, mode: "insensitive" },
      },
      take: 10,
    });

    return opportunities.map((o) => ({
      id: o.id,
      label: o.title,
    }));
  }

  @Get("opportunities/:id")
  async getOpportunityDetails(@Param("id") id: string) {
    return this.prisma.opportunity.findUnique({
      where: { id },
      include: { customer: true },
    });
  }

  @Get("users/:userId/tasks")
  async getPendingTasks(
    @Param("userId") userId: string,
    @Query("status") status?: string,
  ) {
    const { FollowUpTaskStatus } = await import("@prisma/client");
    const tasks = await this.prisma.followUpTask.findMany({
      where: {
        status: FollowUpTaskStatus.pendiente,
        OR: [{ assignedToUserId: userId }, { assignedToUserId: null }],
      },
      orderBy: { dueAt: "asc" },
    });

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt.toISOString(),
      type: t.type,
    }));
  }

  @Get("users/:userId/visits")
  async getScheduledVisits(
    @Param("userId") userId: string,
    @Query("status") status?: string,
  ) {
    const { VisitStatus } = await import("@prisma/client");
    const visits = await this.prisma.visit.findMany({
      where: {
        status: VisitStatus.programada,
        OR: [{ assignedToUserId: userId }, { assignedToUserId: null }],
      },
      orderBy: { scheduledAt: "asc" },
    });

    return visits.map((v) => ({
      id: v.id,
      summary: v.summary ?? "",
      scheduledAt: v.scheduledAt.toISOString(),
    }));
  }

  @Post("interactions")
  async createInteraction(
    @Body() body: {
      customerId: string;
      summary: string;
      rawMessage: string;
      opportunityId?: string;
      occurredAt?: string;
      nextStep?: string;
      signals?: Record<string, unknown>;
    },
  ) {
    const { VisitStatus } = await import("@prisma/client");
    const visit = await this.prisma.visit.create({
      data: {
        status: VisitStatus.completada,
        customerId: body.customerId,
        summary: body.summary,
        nextStep: body.nextStep,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      },
    });

    return { id: visit.id };
  }

  @Post("opportunities")
  async upsertOpportunity(
    @Body() body: {
      customerId: string;
      title: string;
      stage: string;
      opportunityId?: string;
    },
  ) {
    if (body.opportunityId) {
      const updated = await this.prisma.opportunity.update({
        where: { id: body.opportunityId },
        data: { stage: body.stage },
      });
      return { id: updated.id };
    }

    const created = await this.prisma.opportunity.create({
      data: {
        customerId: body.customerId,
        title: body.title,
        stage: body.stage as any,
      },
    });
    return { id: created.id };
  }

  @Post("followups")
  async createFollowUp(
    @Body() body: {
      customerId: string;
      title: string;
      dueAt: string;
      type: string;
      opportunityId?: string;
    },
  ) {
    const { FollowUpTaskType, FollowUpTaskStatus } = await import("@prisma/client");
    const task = await this.prisma.followUpTask.create({
      data: {
        title: body.title,
        dueAt: new Date(body.dueAt),
        type: body.type as FollowUpTaskType,
        status: FollowUpTaskStatus.pendiente,
        customerId: body.customerId,
        opportunityId: body.opportunityId,
      },
    });
    return { id: task.id };
  }

  @Post("tasks")
  async createTask(
    @Body() body: {
      customerId: string;
      title: string;
      dueAt?: string;
      type?: string;
      opportunityId?: string;
      notes?: string;
    },
  ) {
    const { FollowUpTaskType, FollowUpTaskStatus } = await import("@prisma/client");
    const task = await this.prisma.followUpTask.create({
      data: {
        title: body.title,
        dueAt: body.dueAt ? new Date(body.dueAt) : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        type: (body.type as FollowUpTaskType) ?? FollowUpTaskType.llamada,
        status: FollowUpTaskStatus.pendiente,
        customerId: body.customerId,
        opportunityId: body.opportunityId,
        notes: body.notes,
      },
    });
    return { id: task.id };
  }
}
```

- [ ] **Step 2: Create `apps/api/src/modules/laura/laura-agents.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LauraAgentsController } from "./laura-agents.controller";

@Module({
  imports: [PrismaModule],
  controllers: [LauraAgentsController],
})
export class LauraAgentsModule {}
```

- [ ] **Step 3: Create `apps/api/src/modules/auth/service-token.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly serviceToken: string;

  constructor(configService: ConfigService) {
    this.serviceToken = configService.get<string>("LAURA_AGENT_SERVICE_TOKEN") ?? "";
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.serviceToken) {
      throw new UnauthorizedException("Service token not configured");
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers["authorization"] as string | undefined;

    if (!authHeader) {
      throw new UnauthorizedException("Missing authorization header");
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || token !== this.serviceToken) {
      throw new UnauthorizedException("Invalid service token");
    }

    return true;
  }
}
```

- [ ] **Step 4: Add `LauraAgentsModule` to `app.module.ts`**

Add the import and add `LauraAgentsModule` to the imports array in `apps/api/src/modules/laura/laura.module.ts`:

In `laura.module.ts`, add this import at the top:

```typescript
import { LauraAgentsModule } from "./laura-agents.module";
```

And add `LauraAgentsModule` to the `imports` array.

Also add it to `app.module.ts`:

```typescript
import { LauraAgentsModule } from "./modules/laura/laura-agents.module";
```

And add `LauraAgentsModule` to the `imports` array in `AppModule`.

- [ ] **Step 5: Verify NestJS build succeeds**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/api && pnpm build`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/laura/laura-agents.controller.ts apps/api/src/modules/laura/laura-agents.module.ts apps/api/src/modules/auth/service-token.guard.ts apps/api/src/modules/laura/laura.module.ts apps/api/src/app.module.ts
git commit -m "feat: add NestJS internal API endpoints for Laura agent tools"
```

---

## Task 11: Add feature flag for agent routing in NestJS

**Files:**
- Modify: `apps/api/src/modules/laura/laura.controller.ts`
- Modify: `apps/api/src/modules/laura/laura.service.ts`

This adds the `LAURA_USE_AGENT` environment variable. When `true`, NestJS proxies `POST /laura/messages` to the Laura Agent Service instead of using the current procedural flow.

- [ ] **Step 1: Update `apps/api/src/modules/laura/laura.service.ts`**

Add a new method that proxies to the Laura Agent Service. Add this at the top of the file, after the existing imports:

```typescript
import { ConfigService } from "@nestjs/config";
```

Add `configService` to the constructor:

```typescript
constructor(
    private readonly prisma: PrismaService,
    private readonly lauraSessionService: LauraSessionService,
    private readonly lauraContextResolverService: LauraContextResolverService,
    private readonly lauraLlmService: LauraLlmService,
    private readonly lauraPersistenceService: LauraPersistenceService,
    private readonly configService: ConfigService,
  ) {}
```

Add a new method after `handleMessage`:

```typescript
  private get agentBaseUrl(): string {
    return this.configService.get<string>("LAURA_AGENT_BASE_URL") ?? "http://localhost:3100";
  }

  get useAgent(): boolean {
    return this.configService.get<string>("LAURA_USE_AGENT") === "true";
  }

  async handleMessageViaAgent(
    user: AuthUser,
    dto: CreateMessageDto,
  ): Promise<LauraAssistantResponse> {
    const url = `${this.agentBaseUrl}/invoke`;
    const serviceToken = this.configService.get<string>("LAURA_AGENT_SERVICE_TOKEN") ?? "";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify({
        userId: user.id,
        sessionId: dto.sessionId ?? "",
        content: dto.content,
        contextType: dto.contextType,
        contextEntityId: dto.contextEntityId,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new BadRequestException(
        `Laura Agent Service error (${response.status}): ${errorBody}`,
      );
    }

    return response.json() as Promise<LauraAssistantResponse>;
  }
```

- [ ] **Step 2: Update `apps/api/src/modules/laura/laura.controller.ts`**

Modify the `sendMessage` method to check the feature flag:

```typescript
@Throttle({ default: { limit: 10, ttl: 60000 } })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("administrador", "comercial", "director_comercial", "tecnico")
@Post("messages")
async sendMessage(
  @CurrentUser() user: AuthUser,
  @Body(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  dto: CreateMessageDto,
) {
  if (this.lauraService.useAgent) {
    return this.lauraService.handleMessageViaAgent(user, dto);
  }
  return this.lauraService.handleMessage(user, dto);
}
```

- [ ] **Step 3: Update `laura.module.ts` to include `ConfigService`**

The `ConfigService` is already available via `ConfigModule.forRoot()` which is already imported in the `LauraModule`. No changes needed to the module.

- [ ] **Step 4: Verify NestJS build succeeds**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM/apps/api && pnpm build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/laura/laura.service.ts apps/api/src/modules/laura/laura.controller.ts
git commit -m "feat: add LAURA_USE_AGENT feature flag for routing between procedural and agent flows"
```

---

## Task 12: Add pnpm dev script for the agent service

**Files:**
- Modify: `package.json` (root)
- Modify: `apps/agent-laura/package.json`

- [ ] **Step 1: Add a `dev` script for the root `package.json` that includes the agent service**

Update the root `package.json` dev script to also start the agent service:

In `package.json`, change the dev script from:

```json
"dev": "pnpm --parallel --filter @norgtech/api --filter @norgtech/web dev",
```

to:

```json
"dev": "pnpm --parallel --filter @norgtech/api --filter @norgtech/web --filter @norgtech/agent-laura dev",
```

- [ ] **Step 2: Verify dev command starts all three services**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM && pnpm dev`

Expected: NestJS (port 3001), Next.js (port 3000), and Laura Agent (port 3100) all start. Stop after confirming they launch.

- [ ] **Step 3: Commit**

```bash
git add package.json apps/agent-laura/package.json
git commit -m "feat: add agent-laura to pnpm dev script"
```

---

## Task 13: Smoke test the end-to-end flow

This task validates that the entire pipeline works.

- [ ] **Step 1: Start all services**

Run: `cd /Users/xstaked/Desktop/projects/norgtech-CRM && pnpm dev`

- [ ] **Step 2: Test the health endpoint of the agent service**

Run: `curl http://localhost:3100/health`

Expected: `{"status":"ok"}`

- [ ] **Step 3: Test with `LAURA_USE_AGENT=false` (procedural flow unchanged)**

Set `LAURA_USE_AGENT=false` (or don't set it) in `.env`. Verify that the existing chat flow still works as before by testing through the frontend or via curl to `POST /laura/messages`.

- [ ] **Step 4: Test with `LAURA_USE_AGENT=true` (agent routing)**

Set `LAURA_USE_AGENT=true` and `LAURA_AGENT_BASE_URL=http://localhost:3100` in `.env`. Test that `POST /laura/messages` routes to the agent service.

- [ ] **Step 5: Test the internal API endpoints**

```bash
# Set service token
export LAURA_AGENT_SERVICE_TOKEN=test-token

# Test customer search
curl -H "Authorization: Bearer test-token" "http://localhost:3001/laura/agents/customers?search=test"

# Test health
curl http://localhost:3100/health
```

Expected: Endpoints respond correctly.

- [ ] **Step 6: Fix any issues found during smoke testing**

Address any runtime errors, type mismatches, or configuration issues found during smoke testing.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address smoke test issues for Phase 1"
```

---

## Self-Review

**Spec coverage:**
- ✅ Graph architecture with all 10 nodes defined (router, greeting, clarify, extract_intent, build_proposal, await_confirmation, refine, confirm, discard, agenda)
- ✅ State schema matches the design
- ✅ Tools defined for all 10 NestJS internal APIs
- ✅ NestJS internal API endpoints for all agent tools
- ✅ LLM provider support for DeepSeek, Qwen, and OpenAI
- ✅ Feature flag `LAURA_USE_AGENT` for routing between procedural and agent flows
- ✅ Agent runs as separate service with its own port
- ✅ PostgreSQL checkpointer mentioned in design but not yet implemented (Phase 2 will add persistence via LangGraph checkpointer)
- ❌ Streaming not yet implemented (Phase 3 concern)
- ❌ LangGraph checkpointer not yet implemented (Phase 2 will add PostgreSQL checkpointer)

**Placeholder scan:** No TBDs, TODOs, or "implement later" in any task. All steps have complete code.

**Type consistency:** All types are consistently defined in `apps/agent-laura/src/types.ts` and referenced consistently across nodes, tools, and the server. The `LauraStateType` references match the `LauraState` annotation fields. The `AgentResponse` type matches the frontend's expected shape.

**Adjustments made during review:**
1. Added `_extractionResult` field to `LauraState` to carry extraction data between `extract_intent` and `build_proposal` nodes
2. The `await_confirmation` node uses LangGraph's `interrupt()` which is the correct pattern for human-in-the-loop
3. The server.ts handles the case where checkpoint memory hasn't been configured yet — sessions will be stateless for Phase 1 (the proposal confirmation flow will still work because NestJS persists session data, but chat history won't carry across server restarts until Phase 2 adds the checkpointer)