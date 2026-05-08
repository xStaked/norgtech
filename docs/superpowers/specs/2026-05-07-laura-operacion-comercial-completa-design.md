# Laura Operacion Comercial Completa - Design Spec

**Date:** 2026-05-07
**Status:** Draft
**Approach:** Hybrid operational layer on top of Laura platform agent

## Summary

Extend Laura so it can operate the core commercial workflow through chat for four priority entities: `quotes`, `orders`, `followUps`, and `visits`.

This phase is not a generic expansion to every CRM module. It is a focused operational phase that uses the platform-agent foundation only where needed so Laura can:

- create, edit, query status, reschedule, and cancel when applicable
- ask before acting on any meaningful ambiguity
- require editable confirmation before any write is persisted
- surface related impacts when one action affects another commercial object

## Locked Decisions

| Decision | Choice |
|----------|--------|
| Operational priority | Balanced by message intent |
| Write persistence | Editable proposal always required |
| Ambiguity policy | Ask first on relevant ambiguity |
| Quote/order completeness | Nearly complete commercial detail required |
| Read response style | Adaptive summary by default |
| Reschedule/cancel behavior | Propose related impacts |

## Product Goal

Laura should feel like a commercial operator inside the CRM, not just a note-taking assistant.

From natural language, a seller should be able to:

- create a quote with enough detail to be commercially useful
- create an order with item, pricing, and condition context
- create or update a follow-up tied to the right customer, opportunity, quote, or order
- create, reschedule, complete, or cancel a visit
- ask for current status and receive a concise answer with expansion only when risk or dependency matters

## Scope

### In scope

- Full conversational lifecycle for `quote`
- Full conversational lifecycle for `order`
- Full conversational lifecycle for `followUp`
- Full conversational lifecycle for `visit`
- Read queries for status, latest changes, upcoming agenda, and linked entity context
- Mandatory editable proposal before every write action
- Clarification flow for ambiguous customer, opportunity, quote, order, visit, or follow-up references
- Impact-aware proposals for reschedule and cancel actions

### Out of scope

- Full CRUD parity for all remaining CRM entities
- Bulk destructive operations from chat
- Automatic persistence without user confirmation
- Silent reassignment based only on current page context
- Cross-session long-term memory

## Recommended Phase Shape

Use a hybrid phase:

- keep Laura's platform-agent direction as the common backbone
- narrow the visible business scope to `quotes`, `orders`, `followUps`, and `visits`
- implement only the shared planning, validation, and UI improvements needed for those four entities

This keeps the phase valuable in product terms while avoiding an oversized architecture-first rewrite.

## Experience Design

### 1. Intent handling

Laura should classify messages into:

- `read`
- `write`
- `mixed`
- `clarify`
- `confirm`
- `discard`
- `refine`

The classification should be balanced, meaning Laura follows the actual request instead of assuming that agenda items matter more than commercial documents or vice versa.

### 2. Ambiguity handling

If the message leaves a critical reference unclear, Laura must stop and ask the smallest useful question before building a proposal.

Examples:

- "Hay dos cotizaciones abiertas para Acme. Cual queres modificar?"
- "Encontre dos visitas programadas para manana. Cual queres mover?"
- "No me queda claro si el pedido es para Acme Norte o Acme Centro."

Current page context is a hint, not a truth source.

### 3. Mandatory proposal workflow

Every write action must end in a proposal the user can inspect and edit before confirmation.

This includes:

- create quote
- update quote
- cancel quote
- create order
- update order
- cancel order when business rules allow it
- create follow-up
- reschedule follow-up
- complete or cancel follow-up
- create visit
- reschedule visit
- complete or cancel visit

Laura may ask clarifications before the proposal, but it must not persist anything until the user confirms the editable draft.

### 4. Read behavior

Read requests should answer directly without proposal cards.

Default response style:

- brief current state
- next operational step
- risk or blockage only if relevant

Expanded response style should trigger automatically when:

- there are linked entities in tension
- the entity is blocked or overdue
- status alone would be misleading without nearby context

## Entity Rules

### Quotes

Laura must require enough detail to produce a commercially meaningful quote draft:

- customer
- item lines
- quantity per line
- price per line
- conditions or commercial notes
- initial status

If any of those is missing, Laura asks for it before proposing confirmation.

Read behaviors:

- list open quotes
- summarize quote status
- explain why a quote is blocked or stale

Write behaviors:

- create
- update items, prices, notes, status
- cancel when permitted

### Orders

Orders follow the same completeness expectation as quotes:

- customer
- item lines
- quantity
- unit pricing or agreed value
- conditions or fulfillment notes
- initial status

Laura should also surface linked commercial context when available, such as quote origin or pending follow-up after fulfillment.

### Follow-ups

Follow-ups are operational commitments.

Laura should support:

- create
- edit title, note, due date, owner, status
- complete
- cancel
- reschedule
- query upcoming or overdue follow-ups

When a follow-up is tied to a quote, order, or visit, the answer should preserve that relationship in the summary.

### Visits

Visits should support:

- create
- edit schedule and summary
- complete with resulting note or outcome
- cancel
- reschedule
- query today's or upcoming visits

If a visit moves or is canceled, Laura should detect whether linked follow-ups or commercial commitments should also be reviewed.

## Related Impact Logic

When the user asks to reschedule or cancel, Laura should not stop at the directly mentioned entity if there is a nearby operational consequence.

Expected behavior:

- rescheduling a visit can trigger a proposed follow-up date adjustment
- canceling a visit can trigger a warning about an unresolved quote review
- canceling a follow-up can trigger a warning if it is the only pending action on an open order
- moving a quote commitment date can trigger a suggested visit or follow-up adjustment

Important:

- Laura proposes or warns
- Laura does not silently mutate related entities
- related impacts should appear as separate editable proposal actions where applicable

## Architecture Direction

### Shared platform pieces to use

- capability-aware intent planning
- validator that enforces confirmation and required fields
- proposal builder with compact summary + expanded details
- session context for current entities and active proposal

### Phase-specific additions

- capability coverage completed for `quote`, `order`, `followUp`, and `visit`
- required-field validation specific to commercial completeness
- related-impact detector for reschedule and cancel flows
- adaptive read formatter for status answers

### Suggested flow

`message -> planner -> validator -> clarify or read-execute or proposal-build -> user edits -> confirm -> persistence -> confirmation summary`

## UX Direction

The current proposal card should move further toward a compact operator workflow:

- summary first
- detail on expansion
- edit only the fields that matter
- separate direct read answers from editable write actions

For this phase, the UI must be especially strong at:

- showing quote and order line summaries clearly
- distinguishing the primary requested action from related impact actions
- making cancel/reschedule consequences understandable before confirm

## Error Handling

Laura should fail safely and specifically.

- Unsupported action: explain limitation and offer the nearest supported path
- Missing critical data: ask one concise question
- Ambiguous reference: ask before proposal
- Partial backend failure on confirm: report which actions saved and which failed
- Invalid related impact: keep the primary action if safe, flag the related one separately

## Testing Focus

This phase should be verified with scenario-driven tests, not just isolated unit coverage.

Critical scenarios:

- create quote with complete detail
- fail to create quote until required fields are present
- create order from natural language with complete detail
- reschedule visit and propose linked follow-up adjustment
- cancel follow-up and warn about open commercial dependency
- read quote/order status with adaptive expansion
- ambiguous customer or document reference triggers clarification before proposal
- mixed request creates multi-action proposal without persisting early

## Success Criteria

- Laura can operate the four priority entities end-to-end through chat
- No write action persists without editable user confirmation
- Laura never guesses through meaningful ambiguity
- Quotes and orders cannot be confirmed in a commercially weak state
- Read responses remain concise unless risk or dependency requires more context
- Reschedule and cancel flows make linked operational impacts visible before persistence

## Recommended Next Plan

Split implementation into three layers:

1. Agent planning and validation for the four target entities
2. Persistence and backend action coverage for create/update/cancel/reschedule flows
3. Compact proposal and adaptive read UX for multi-action commercial operations
