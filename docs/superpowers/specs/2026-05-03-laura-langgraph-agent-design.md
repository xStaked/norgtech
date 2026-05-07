# Laura Agent: LangGraph JS Microservice Design

**Date:** 2026-05-03
**Status:** Approved
**Decision:** Option A — LangGraph JS as a separate microservice

## Problem Statement

The current Laura chat implementation is a procedural if/else flow in `laura.service.ts` (NestJS). It handles greeting → clarification → agenda → proposal branching with hardcoded logic. This creates three pain points:

1. **Rigid flow** — Adding new interaction modes or steps requires modifying tangled conditional logic
2. **No streaming** — The frontend fetch-then-renders; no incremental token delivery
3. **Limited intelligence** — No tool calling, no dynamic DB queries, no multi-turn refinement of proposals

## Architecture

```
Frontend (Next.js)  ←→  NestJS CRM API  ←→  PostgreSQL  (CRM tables + agent schema)
                              │
                              │ HTTP
                              │
                       Laura Agent Service
                       (LangGraph JS)
                       
                       - Graph with nodes & conditional edges
                       - Checkpointer (same PG, separate tables)
                       - Tool calling via NestJS internal APIs
                       - Streaming SSE
```

**Key principle:** The agent NEVER writes directly to CRM tables. All data mutations go through NestJS internal API endpoints. NestJS is the gatekeeper for business rules and data integrity.

### State Management

- LangGraph's PostgreSQL checkpointer persists graph state in its own tables (`langgraph_*` schema)
- Session data (messages, proposals) continues to live in CRM tables, managed by NestJS
- The agent holds transient state during a conversation turn and uses tools to persist when needed

### LLM Providers

Three providers supported, configurable via env vars:

| Provider | Model (default) | Env Key |
|----------|-----------------|---------|
| DeepSeek | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| Qwen | `qwen-plus` | `QWEN_API_KEY` |
| OpenAI | `gpt-4o-mini` | `OPENAI_API_KEY` |

Selected via `LAURA_LLM_PROVIDER` env var (default: `deepseek`), model override via `LAURA_LLM_MODEL`.

## Graph Design

### Nodes

| Node | Responsibility | Tools Used |
|------|---------------|------------|
| `router` | Classify message: greeting, agenda_query, report, clarification_reply | None (LLM call) |
| `greeting` | Return Laura's greeting message | None |
| `clarify` | Detect ambiguity in customer/opportunity and request options | `search_customers`, `search_opportunities` |
| `extract_intent` | LLM extracts: summary, signals, followUp, task details | LLM call |
| `build_proposal` | Build editable proposal payload with blocks | `get_customer_details`, `get_opportunity_details` |
| `await_confirmation` | Interrupt — pause graph for user review | None |
| `refine` | Process user feedback to adjust the proposal | LLM call |
| `confirm` | Persist proposal via NestJS API | `create_interaction`, `upsert_opportunity`, `create_followup`, `create_task` |
| `discard` | Mark proposal as discarded | None |
| `agenda` | Fetch and return user's commercial agenda | `get_pending_tasks`, `get_scheduled_visits` |
| `persist_crm` | Save data to CRM (always via NestJS API) | Same as confirm |

### State Schema

```typescript
const LauraState = Annotation.Root({
  sessionId: Annotation<string>,
  userId: Annotation<string>,
  messages: Annotation<BaseMessage[]>,
  mode: Annotation<"greeting" | "clarification" | "proposal" | "agenda">,
  // Context
  customerContext: Annotation<{ id: string; label: string } | null>,
  opportunityContext: Annotation<{ id: string; label: string } | null>,
  // Clarification
  clarificationOptions: Annotation<{ type: string; options: Array<{id: string; label: string}> } | null>,
  // Proposal
  proposal: Annotation<ProposalPayload | null>,
  proposalId: Annotation<string | null>,
  proposalStatus: Annotation<"draft" | "confirmed" | "discarded">,
  // Agenda
  agendaItems: Annotation<AgendaItem[] | null>,
  // Metadata
  lastError: Annotation<string | null>,
})
```

### Flow

```
router → greeting | clarify | agenda | extract_intent
clarify → (loop: user picks option) → extract_intent
extract_intent → build_proposal
build_proposal → await_confirmation
await_confirmation → confirm | refine | discard
refine → build_proposal (loop)
confirm → persist_crm → response
discard → response
agenda → response
```

The `await_confirmation` node uses LangGraph's `interrupt()` to pause execution until the user responds (edit, confirm, or discard). This enables the iterative refinement flow.

## Proposal Iterative Flow

This replaces the current one-shot proposal generation:

1. `build_proposal` generates a proposal draft
2. `await_confirmation` pauses the graph (interrupt) and returns the proposal to the frontend
3. The user can: edit block fields inline, chat to refine, confirm, or discard
4. If the user chats to refine → `refine` node processes feedback → loops back to `build_proposal` → new draft
5. If the user confirms → `confirm` → `persist_crm`
6. If the user discards → `discard` → end

## Project Structure

```
norgtech-CRM/
├── apps/
│   ├── api/                        # NestJS CRM (existing)
│   ├── web/                        # Next.js frontend (existing)
│   └── agent-laura/                # NEW — Laura Agent Service
│       ├── src/
│       │   ├── graph/
│       │   │   ├── nodes/
│       │   │   │   ├── router.ts
│       │   │   │   ├── greeting.ts
│       │   │   │   ├── clarify.ts
│       │   │   │   ├── extract-intent.ts
│       │   │   │   ├── build-proposal.ts
│       │   │   │   ├── await-confirmation.ts
│       │   │   │   ├── refine.ts
│       │   │   │   ├── confirm.ts
│       │   │   │   ├── discard.ts
│       │   │   │   ├── agenda.ts
│       │   │   │   └── persist-crm.ts
│       │   │   ├── edges.ts
│       │   │   ├── state.ts
│       │   │   └── graph.ts
│       │   ├── tools/
│       │   │   ├── search-customers.ts
│       │   │   ├── search-opportunities.ts
│       │   │   ├── get-customer-details.ts
│       │   │   ├── get-opportunity-details.ts
│       │   │   ├── get-pending-tasks.ts
│       │   │   ├── get-scheduled-visits.ts
│       │   │   ├── create-interaction.ts
│       │   │   ├── upsert-opportunity.ts
│       │   │   ├── create-followup.ts
│       │   │   └── create-task.ts
│       │   ├── prompts/
│       │   │   ├── system-prompt.ts
│       │   │   ├── router-prompt.ts
│       │   │   ├── extract-prompt.ts
│       │   │   └── refine-prompt.ts
│       │   ├── config/
│       │   │   └── providers.ts
│       │   └── server.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── langgraph.json
├── packages/
│   └── shared/                     # Shared types (existing)
```

## NestJS Internal APIs for Agent Tools

All authenticated with a service token (not exposed to frontend).

| Method | Endpoint | Tool |
|--------|----------|------|
| GET | `/laura/agents/customers?search=` | `search_customers` |
| GET | `/laura/agents/opportunities?search=` | `search_opportunities` |
| GET | `/laura/agents/customers/:id` | `get_customer_details` |
| GET | `/laura/agents/opportunities/:id` | `get_opportunity_details` |
| GET | `/laura/agents/users/:id/tasks?status=pendiente` | `get_pending_tasks` |
| GET | `/laura/agents/users/:id/visits?status=programada` | `get_scheduled_visits` |
| POST | `/laura/agents/interactions` | `create_interaction` |
| POST | `/laura/agents/opportunities` | `upsert_opportunity` |
| POST | `/laura/agents/followups` | `create_followup` |
| POST | `/laura/agents/tasks` | `create_task` |

## Migration Strategy

### Phase 1: Infrastructure (no functional changes)
- Create `apps/agent-laura/` with compiled graph and tools
- Create internal NestJS endpoints (`/laura/agents/*`)
- Checkpointer pointing to same PostgreSQL, own schema (`langgraph_*`)
- Agent runs but NestJS still uses current procedural flow

### Phase 2: Feature flag — backend switch, same frontend
- Add `LAURA_USE_AGENT=true/false` env var
- `false`: NestJS uses current `laura.service.ts` (unchanged)
- `true`: NestJS proxies to Laura Agent Service
- Frontend response shape stays identical (`LauraAssistantResponse` with same modes)
- Safe testing in staging with flag enabled

### Phase 3: Real streaming to frontend
- New endpoint `GET /laura/messages/stream` proxying agent streaming to frontend
- `laura-chat.tsx` upgrades from fetch-then-render to incremental streaming
- Response modes preserved: `greeting`, `clarification`, `proposal`, `agenda`

### Phase 4: Iterative proposal refinement
- Activate `refine` → `build_proposal` → `await_confirmation` loop
- Frontend adds chat-within-proposal refinement support
- `refine` node uses LLM to adjust proposals based on user feedback

### Phase 5: Cleanup
- Remove old procedural flow (`DeterministicLauraExtractorProvider`, logic in `laura.service.ts`)
- Simplify NestJS: gateway + internal APIs for tools only
- Move prompts to agent service files

### Success Metrics

| Phase | Success Criterion |
|-------|--------------------|
| 1 | Graph compiles, tools call NestJS APIs, checkpointer persists state |
| 2 | With flag `true`, chat works identically to current flow, same response types |
| 3 | Streaming works, tokens arrive incrementally to frontend |
| 4 | User can chat to refine a proposal and changes are reflected |
| 5 | Old code removed, NestJS slim, everything flows through agent |