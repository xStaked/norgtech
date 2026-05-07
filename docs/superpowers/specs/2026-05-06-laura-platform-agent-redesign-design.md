# Laura Platform Agent Redesign

## Goal

Redesign Laura from a keyword-routed assistant into an intelligent platform chat that can help users operate the CRM through natural language.

Laura must understand what the platform can do, use current session context, ask concise clarification questions when needed, execute read-only requests directly, and turn every write action into a compact proposal that the user must confirm before anything is persisted.

## Current Problem

The current agent already has useful pieces: LangGraph orchestration, session state, CRM tools, agenda support, proposal confirmation, and frontend proposal rendering.

The weak point is intent handling. The router depends heavily on string conditions and keyword order. This does not scale to a full-platform assistant because small phrasing changes can route a message incorrectly. Examples include words like "cliente", "semana", "hoy", "cotizacion", or "avanza" causing the wrong mode.

The frontend confirmation experience also needs to be lighter. A mandatory confirmation step is correct, but a large draft card inside the chat makes the product feel like a form, not an intelligent assistant.

## Product Principles

- Laura is a platform operator, not just a sales note taker.
- The chat should feel natural and context-aware.
- Laura should know the CRM's real capabilities instead of guessing from broad prompts.
- Read operations can answer directly.
- Write operations always require explicit confirmation.
- If required information is missing, Laura asks the smallest useful question.
- Proposal UI is compact by default and expands only when the user needs details or editing.
- The user should never need to understand internal entity schemas to use Laura.

## Recommended Architecture

Use a capability-driven agent.

Instead of routing with keyword conditionals, Laura should interpret each message against a formal capability registry that describes the CRM modules, allowed actions, required fields, permissions, confirmation requirements, and tool bindings.

The agent flow becomes:

1. Build conversation context.
2. Plan intent with structured LLM output.
3. Validate the plan against platform capabilities.
4. Resolve missing entities or fields.
5. Execute read-only actions directly.
6. Build compact proposals for write actions.
7. Execute confirmed actions only after user approval.

## Core Components

### CapabilityRegistry

Defines what Laura can do in the platform.

Each capability should include:

- domain: customer, contact, opportunity, visit, followup, quote, order, product, segment, report, dashboard
- action: search, detail, create, update, cancel, complete, change status, add item
- required fields
- optional fields
- permissions or roles
- whether confirmation is required
- read or write classification
- tool/API binding
- human summary template for proposals

This registry becomes Laura's source of truth for "what can be done".

### ContextManager

Builds the current working context for every turn.

Context sources:

- current session messages
- authenticated user and role
- current page context, such as open customer or opportunity
- latest agenda items
- latest search results
- active proposal
- mentioned entities from previous turns

The context must be passed to the planner in compact structured form, not as unbounded transcript text.

### IntentPlanner

Uses an LLM with strict structured output to create an execution plan.

The planner output should include:

- intent type: read, write, mixed, clarification, greeting, help
- actions
- target domains
- extracted fields
- entity references
- confidence
- missing fields
- ambiguity
- proposed clarification question

The planner should not execute tools. It only describes what should happen.

### PlanValidator

Checks the planner output against the capability registry.

It should reject or downgrade plans when:

- the action is not supported
- required fields are missing
- the user lacks permission
- a write action is marked as executable without confirmation
- an entity reference is ambiguous
- the plan contains unsupported fields

Invalid or incomplete plans become clarification responses.

### ClarificationEngine

Creates the smallest useful question when Laura cannot safely proceed.

Examples:

- "Encontré dos clientes llamados Acme. ¿Cuál querés usar?"
- "¿Qué producto querés agregar a la cotización?"
- "¿Para qué fecha dejamos el seguimiento?"

Clarifications should preserve the partially built plan so the user can answer naturally.

### ToolExecutor

Executes tools only after validation.

Rules:

- read tools can execute immediately
- write tools execute only from confirmed proposals
- errors are captured per action
- partial failures are reported clearly
- confirmed multi-action writes should prefer transactional backend endpoints where possible

### ProposalBuilder

Converts validated write plans into user-confirmable actions.

A proposal may contain multiple actions from one user message, such as:

- create quote
- add quote items
- create follow-up
- update opportunity stage

Each action should have:

- compact title
- short human summary
- required data
- editable detail data
- status: ready, missing_data, needs_review, confirmed, discarded, failed

## UX Design: Compact Confirmation

Confirmation remains mandatory, but the proposal should not be a large form-like card by default.

Default chat rendering should be a compact action summary:

```text
Laura preparó 2 acciones para confirmar:

1. Crear cotización para Acme
   3 aireadores modelo X · total estimado $...

2. Crear seguimiento
   Viernes · Llamar para revisar cotización

[Editar] [Descartar] [Confirmar]
```

Detailed fields should be hidden until the user chooses to inspect or edit an action.

Expanded detail can appear in a drawer, modal, or focused inline expansion:

```text
Cotización
Cliente: Acme
Producto: Aireador X
Cantidad: 3
Precio unitario: ...
Notas: ...
```

The UI should avoid:

- rendering every technical field by default
- stacking large cards inside the chat
- mixing read-only QA answers and write proposals in the same visual block
- making confirmation feel like manually filling the CRM

Recommended frontend pieces:

- `LauraProposalSummary`: compact in-chat proposal
- `LauraProposalActionRow`: one row per proposed action
- `LauraProposalDetails`: expanded editable detail
- `LauraProposalConfirmBar`: confirm/discard/edit controls

## Conversation Examples

### Mixed Write Request

User:

```text
Creale una cotización a Acme por 3 aireadores y dejame seguimiento para el viernes.
```

Laura:

```text
Encontré dos productos que podrían ser "aireador". ¿Cuál querés usar?
```

After clarification:

```text
Laura preparó 2 acciones para confirmar:

1. Crear cotización para Acme
   3 Aireador Turbo 2HP

2. Crear seguimiento
   Viernes · Revisar cotización enviada

[Editar] [Descartar] [Confirmar]
```

### Read Request

User:

```text
Qué cotizaciones abiertas tiene Acme?
```

Laura executes read tools and answers directly. No proposal is shown.

### Unsupported Request

User:

```text
Borrá todos los pedidos viejos.
```

Laura should not invent capability. It should explain that bulk deletion is not available from chat and offer supported alternatives, such as listing old orders or filtering by status.

## Data Flow

1. Frontend sends message with session ID, user, role, and optional page context.
2. Agent loads session context and current active proposal if any.
3. `IntentPlanner` produces structured plan.
4. `PlanValidator` checks capability, permissions, missing data, and confirmation requirements.
5. If clarification is needed, Laura asks a compact question.
6. If plan is read-only, tools execute and Laura answers directly.
7. If plan contains writes, `ProposalBuilder` creates a compact proposal.
8. Frontend shows proposal summary.
9. User confirms, edits, or discards.
10. Confirmed proposal executes through `ToolExecutor`.
11. Result is persisted in conversation history and audit trail.

## Error Handling

- Tool failures should be reported in user language, not stack traces.
- Multi-action confirmations should report per-action results.
- Missing required fields should become clarification, not failed proposals.
- Low-confidence plans should ask before proposing.
- Unsupported actions should explain what Laura can do instead.
- Permission failures should say the user does not have access to that action.

## Testing Strategy

Add conversation-level tests that assert behavior, not keyword routing.

Test groups:

- read-only queries across modules
- write requests that produce compact proposals
- mixed requests with multiple write actions
- missing field clarification
- ambiguous entity clarification
- active proposal confirmation, editing, and discard
- unsupported actions
- permission failures
- false-positive phrases such as "semana pasada", "Tecnología Avanzada", and "no guardar"

Existing router keyword tests should be replaced or rewritten around planner outcomes.

## Implementation Boundaries

This redesign should reuse the existing LangGraph service, CRM tools, confirmation endpoint, and Laura frontend shell where practical.

Expected larger changes:

- replace heuristic router with structured planning
- add capability registry
- add plan validation
- normalize proposal shape around action summaries
- redesign frontend proposal rendering to be compact and progressive
- expand tests around realistic conversations

This spec does not require changing the entire CRM API. It does require making the agent's understanding of the CRM explicit and testable.

## Success Criteria

- Users can ask Laura to operate the CRM in natural language.
- Laura understands page/session context.
- Read requests answer directly with real data.
- Every write request produces a confirmation proposal before persistence.
- Proposal UI is compact by default.
- Laura asks clarification questions instead of guessing critical fields.
- Keyword routing bugs are eliminated from the main path.
- Tests cover real conversational flows across the platform.
