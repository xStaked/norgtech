# Laura QA Node — Contextual Intelligence Design

**Date**: 2026-05-03  
**Status**: Approved  

## Problem

Laura's current agent has two intelligence gaps:

1. **No contextual follow-up**: When the user asks "esa llamada a que hora es?" after seeing their agenda, Laura re-dumps the entire agenda with the generic "Estas son tus prioridades comerciales actuales" instead of answering the specific question.

2. **No entity-specific queries**: When the user asks "a que empresa pertenece Carlos Mendoza?", the clarify node passes the entire message as a search query, returning all partial matches as options to select from, instead of answering the question directly.

## Root Cause

- The router uses keyword heuristics that can't distinguish between "show me my agenda" (list request) and "what time is that call?" (specific question).
- The agenda node only produces a generic message regardless of context.
- The clarify node is designed only for disambiguating customer selection, not for answering questions about data.

## Solution: Add a QA Node with LLM + Tool Calling

### Architecture

A new `qa` node in the LangGraph graph that uses the LLM with tool calling to reason about the user's question and provide specific, contextual answers.

```
User: "esa llamada a que hora es?"
  → Router → qa
  → QA node:
    1. System prompt with persona + available tools
    2. LLM calls tools (getScheduledVisits, etc.)
    3. LLM sees "Llamar a Carlos Mendoza, 15:00"
    4. Returns: "La llamada a Carlos Mendoza está programada para las 15:00 hs."

User: "a que empresa pertenece Carlos Mendoza?"
  → Router → qa
  → QA node:
    1. LLM calls searchCustomers("Carlos Mendoza")
    2. LLM may call getCustomerDetails(id) for more info
    3. Returns: "Carlos Mendoza pertenece a la empresa Agropecuaria Lara."
```

### Files to Create

#### `apps/agent-laura/src/graph/nodes/qa.ts`
- New QA node function
- Uses `createLlm().bindTools(allTools)` with read-only tools (search + get, no create)
- System prompt: Laura persona, answer questions using available data, be specific and concise
- Passes conversation history for context
- Returns `{ mode: "qa", messages: [...state.messages, new AIMessage(answer)] }`

### Files to Modify

#### `apps/agent-laura/src/graph/nodes/router.ts`
- Add `"qa"` to the return type
- Add QA detection logic:
  - If `state.agendaItems` exists (agenda was shown) and user asks a follow-up question → `qa`
  - If message contains question patterns (question words + entity references) → `qa`
  - Question patterns: `"que hora"`, `"que empresa"`, `"cuando"`, `"cuántos"`, `"cual es"`, etc.
- QA routing comes after greeting/conflict checks but before the default `proposal` fallback

#### `apps/agent-laura/src/graph/edges.ts`
- Add `qa: "qa"` to the router edge mapping

#### `apps/agent-laura/src/graph/graph.ts`
- Import and add `qaNode` to the graph
- Add edge from `qa` to `END`

#### `apps/agent-laura/src/graph/state.ts`
- No changes needed (QA uses `messages` for the answer)

#### `apps/agent-laura/src/types.ts`
- Add `"qa"` to `AgentMode` union type
- Add `qa` response variant to `AgentResponse` (just `mode: "qa"`, no extra payload needed)

#### `apps/agent-laura/src/server.ts`
- `stateToResponse` already handles all modes that produce a message — `qa` works automatically since the message is in the messages array

#### `apps/web/src/components/laura/laura-types.ts`
- Add `qa` variant to `LauraAssistantResponse` discriminated union:
  ```typescript
  | { mode: "qa"; sessionId: string; message: string }
  ```

#### `apps/web/src/components/laura/laura-chat.tsx`
- Handle `mode === "qa"` the same as `mode === "greeting"` — just display the message
- No special UI card needed

### Router QA Detection Logic

```typescript
// 1. If agenda was shown and user asks a follow-up
if (state.agendaItems && state.agendaItems.length > 0 && isFollowUpQuestion(normalized)) {
  return "qa";
}

// 2. Questions about specific entities/data
const qaPatterns = [
  "que hora", "que empresa", "cuando", "cuándo",
  "cuantos", "cuántos", "cual es", "cuál es",
  "donde", "dónde", "quien es", "quién es",
  "pertenece", "a que", "a qué",
  "telefono", "teléfono", "email", "correo",
  "cuanto", "cuánto",
];
if (qaPatterns.some((p) => normalized.includes(p))) {
  return "qa";
}
```

### QA Node System Prompt

```
Eres Laura, asistente comercial del CRM Norgtech. Respondé la pregunta del usuario usando los datos disponibles a través de las herramientas.

Reglas:
1. Usá las herramientas para obtener datos reales antes de responder.
2. Respondé de forma específica y concisa. No repitas la información completa si solo preguntaron por un detalle.
3. Si no encontrás datos, decilo honestamente.
4. Nunca inventes información.
5. Si la pregunta se refiere a algo mencionado en la conversación anterior, usá ese contexto.
```

### Read-only Tools for QA

The QA node will only have access to read-only tools:
- `search_customers` — search customers by name
- `search_opportunities` — search opportunities
- `get_customer_details` — get customer details with contacts
- `get_opportunity_details` — get opportunity details
- `get_pending_tasks` — get pending tasks for a user
- `get_scheduled_visits` — get scheduled visits for a user

No create/update tools — those remain exclusive to the proposal/confirm flow.

### Fallback Behavior

If the LLM with tools fails or times out, the QA node falls back to a simple message:
"No pude obtener esa información en este momento. ¿Podés reformular la pregunta?"

### Environment Change

Switch `LAURA_USE_AGENT=true` in `apps/api/.env` so the NestJS API routes requests to the agent-laura service.