# Agentic WhatsApp Expense Flow — Design

**Date:** 2026-06-22
**Status:** Approved (design); pending implementation plan
**Scope:** Phase 1 — migrate the WhatsApp **expense** flow from the deterministic regex planner to the LLM agent. Other flows (orders, payments, logistics, agenda, queries) stay on the planner.

---

## 1. Problem

The WhatsApp expense flow dead-ends and feels unintelligent. Reproduction (real transcript):

1. Commercial sends a receipt photo.
2. Bot OCRs it: "Leí el soporte: valor $25.000, fecha 2026-04-24, categoria alimentacion, proveedor INVERSIONES ARIAS SERNA S.A.S. **Dejo el gasto listo para revisión.**"
3. Commercial replies "lo veo bien".
4. Bot re-sends the greeting menu. Nothing happens.

### Root cause

There are **two separate brains** and WhatsApp is wired to the deterministic one.

- `agents/nora/src/agent.py` — a real LangGraph LLM agent with tool-calling. Used **only** by the web chat (`/messages`). Has no expense/payment tools registered.
- `agents/nora/src/operation/planner.py` — a hand-written regex/keyword `if/else` cascade. Handles **every WhatsApp message**. No LLM.

Two concrete failures in the planner path:

1. **No natural-language understanding.** `planner.py:447` `_is_expense_case_continuation()` only accepts a fixed phrase list (`"dale","ok","listo","si","perfecto"…`). "lo veo bien" is absent, so the message matches nothing, falls through to `clasificacion`, and returns the greeting. This is unfixable by enumeration — humans never produce a closed phrase set.

2. **No finalize step.** Even a recognized "ok" wouldn't create anything. The case reaches `ready_for_review` in `NoraConversationCase` after OCR and **stops there**. No code turns that case into a `CommercialExpense` record; `executedEntityId` is never set for expenses. The only path that actually creates an expense is a human filling the UI form (`POST /commercial-expenses`). So "listo para revisión" literally means "I wrote data to a scratchpad and stopped."

### What already exists (and is reused)

- Persistent case store: `NoraConversationCase` (`type`, `status`, `extractedData`, `missingFields`, `attachments`, `executedEntityType`, `executedEntityId`, `lastQuestion`) — `apps/api/src/modules/whatsapp/nora-case.service.ts`.
- Background OCR: `nora-expense-extraction.service.ts` → `commercial-expense-extraction.provider.ts` (OpenAI vision), already fills `extractedData` and updates the case.
- Expense creation endpoint + workflow: `POST /commercial-expenses` creates a `CommercialExpense` with status `pendiente` (= awaiting admin review) and a linked `CommercialExpenseSupport`.
- Reply pipeline: `nora-routing.service.ts` `extractSuggestedReply()` → `whatsAppService.sendAgentReply()` → Kapso.
- The agent's HTTP-tool pattern: `agents/nora/src/tools/nestjs_client.py` (forwards a Bearer JWT) + tools like `tools/orders.py`.

The backend "harness" is therefore already present. What is missing is a brain that uses it for WhatsApp, plus a closed expense lifecycle.

---

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Approach | Go agentic — route the WhatsApp expense flow through the LLM agent; retire the regex path for this flow. |
| State ownership | **NestJS stays the source of truth.** Agent is stateless; NestJS sends history + open case each turn and persists changes. |
| Execution | **Agent calls backend tools directly** (reads then acts, reacts to results in one turn). NestJS authorizes every endpoint call. |
| Rollout | **Expenses first**, end to end. Other flows stay on the planner and migrate later using this template. |

---

## 3. Architecture

### 3.1 Routing branch — NestJS (`nora-routing.service.ts`)

Add a flag-gated decision (`NORA_WHATSAPP_AGENT_EXPENSES`). A turn is part of the expense flow when **either**:

- the sender is `comercial` and the inbound message carries media, **or**
- there is an open case of `type = expense`.

For expense-flow turns → call the new Nora endpoint `POST /whatsapp/agent`. All other turns → existing `POST /whatsapp/route` (planner), unchanged.

**Fallback:** if the agent endpoint errors or times out, fall back to the planner path so live traffic never dead-ends. Log the fallback.

### 3.2 Stateless agentic endpoint — Nora (`agents/nora/src/whatsapp_agent.py`, new)

`POST /whatsapp/agent` accepts:

```
{
  history: [{role, body, ...}],        # recent conversation, NestJS-provided
  open_case: { type, status, extractedData, missingFields, attachments } | null,
  media: {...} | null,                 # current-turn attachment metadata
  sender: { type, userId, name },
  auth: "Bearer <scoped-jwt>"          # see 3.4
}
```

Behavior:

- Build the LangGraph message list from `history` plus a **context block** (system or leading message) that states the open case: extracted fields, missing fields, status, and whether a support attachment exists.
- Run the graph **with no checkpointer** — full state arrives each turn, so the agent is genuinely stateless (survives restarts and multiple processes).
- Return:

```
{
  reply_text: str,                     # natural-language WhatsApp reply
  case_update: {                       # how NestJS should mutate the case
    extractedData?, missingFields?, status?
  } | null,
  executed_entity: {                   # set when an expense was created
    type: "CommercialExpense", id
  } | null
}
```

The endpoint reuses the existing `build_nora_graph` pattern but with the expense toolset and a system prompt scoped to the expense flow.

### 3.3 Expense tools — Python (`agents/nora/src/tools/expenses.py`, new)

- `lookup_customer(query)` — reuse/share `search_customers`; for the optional client/visit association.
- `create_expense(expense_date, category, amount, description, supplier_name?, supplier_nit?, invoice_number?, payment_method?, customer_id?, visit_id?, support_attachment_ref?)`
  - POSTs to the NestJS expense-from-WhatsApp path (see 3.5), linking the already-stored support attachment by reference (no re-upload).
  - Passes `extractionConfidence` / `extractionModel` through from the OCR result when present.
  - Returns `{ id, status: "pendiente" }`.
  - **Idempotency:** the tool must not create a second expense; NestJS rejects creation when the case already has `executedEntityId`, and the tool surfaces that as "ya estaba registrado".

OCR is **not** a tool — it stays in NestJS and arrives via `open_case.extractedData`. The agent reads, summarizes, and on user confirmation calls `create_expense`.

### 3.4 Auth bridge — NestJS

WhatsApp turns have no user JWT, which is why an autonomous agent could not act. NestJS resolves the sender to a commercial user and mints a **short-lived, scoped JWT for that user**, passed to the agent as `auth`. The agent forwards it on every tool call, so existing endpoint authorization applies unchanged (a client cannot create an expense, scope is the resolved user's). Token lifetime covers a single turn's tool calls.

### 3.5 Support-attachment linking — NestJS

`POST /commercial-expenses` currently expects a multipart upload. The WhatsApp support image is already stored (Kapso/R2) and attached to the case. Add a create path (or extend the service) that accepts a **reference to an existing WhatsApp attachment** and links it as the `CommercialExpenseSupport`, instead of requiring a re-upload from the agent. The expense is created with status `pendiente`.

### 3.6 Reply + case write-back — NestJS

For agent-handled turns:

- `reply_text` becomes the WhatsApp reply. Give it top priority in `extractSuggestedReply()` for these turns.
- Apply `case_update` to `NoraConversationCase` (status, missingFields, merged extractedData).
- When `executed_entity` is present, mark the case executed: `status = executed`, `executedEntityType = "CommercialExpense"`, `executedEntityId = id`.

---

## 4. End-to-end flow (the fixed scenario)

```
commercial sends receipt
  → NestJS: create expense case, run background OCR → extractedData filled
  → agent turn: "Leí el soporte: $25.000, alimentación, INVERSIONES ARIAS SERNA. ¿Lo confirmo?"
"lo veo bien"
  → NestJS: open expense case → POST /whatsapp/agent (with scoped token)
  → LLM interprets as confirmation → create_expense tool → NestJS creates expense #1234 (pendiente), links support
  → agent returns reply_text + executed_entity
  → NestJS: case → executed (executedEntityId=1234); sends reply
  → "Listo, registré el gasto de $25.000 (#1234). Queda en revisión."
```

---

## 5. Error handling

- **Agent tool failure** (e.g. create_expense 4xx/5xx): the agent surfaces the NestJS validation message naturally and asks for the missing/ wrong field; no case execution.
- **Agent endpoint failure/timeout:** NestJS falls back to the planner path; logged.
- **Double confirmation:** idempotency guard via `executedEntityId` — no duplicate expense; reply states it is already registered.
- **Missing required field** (e.g. amount not on receipt): agent asks for it conversationally; case stays `collecting_info` with `missingFields`.

---

## 6. Testing

**Python (Nora):**
- Expense flow with mocked NestJS client.
- Confirmation recognized across phrasings: "lo veo bien", "sí", "correcto", "dale", "está bien".
- Missing-amount path: agent asks instead of creating.
- `create_expense` success → `executed_entity` returned.
- Idempotency: second confirm on an executed case does not create again.

**NestJS:**
- Routing branch selects the agent for expense-flow turns; planner for others.
- Planner fallback on agent error/timeout.
- Case write-back: status → executed, `executedEntityType`/`executedEntityId` set.
- Auth bridge: minted token is scoped to the resolved commercial user; a non-authorized sender cannot create an expense.
- Attachment linking: existing WhatsApp support is linked, not re-uploaded.

**Scenario test:** reproduce the screenshot end to end — receipt → summary → "lo veo bien" → expense created and case executed.

---

## 7. Out of scope (this phase)

Orders, payments, logistics, agenda, and queries remain on the regex planner. Each becomes a later phase, migrated onto the same stateless-agent + backend-tools + reply-writeback template established here.
