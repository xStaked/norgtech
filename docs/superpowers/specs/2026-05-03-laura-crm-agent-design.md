# Laura CRM Agent v2 — Design Spec

**Date:** 2026-05-03
**Status:** Draft
**Approach:** Expand existing LangGraph agent (Approach A)

## Summary

Expand the existing Laura agent to manage the entire CRM through chat. The agent will understand context across visits, agenda, follow-ups, clients, opportunities, quotes, orders, products, and segments. Read queries respond directly; write actions generate proposals for user confirmation.

## Decisions

| Decision | Choice |
|----------|--------|
| Action mode | Propose & confirm for writes, direct for reads |
| Entity scope | Full CRUD on all entities |
| Architecture | Expand existing LangGraph (router → specialized nodes) |
| Context | Within-session context (no cross-session memory) |
| Block format | Expand current blocks with `action` field (create/update/delete) |

## 1. Agent Architecture & Flow

### Current flow

```
router → greeting | agenda | clarify | extract_intent → build_proposal | refine | confirm | discard | qa
```

### New flow

```
router → greeting | agenda | query | clarify | extract_intent | modify → build_proposal | refine | confirm | discard | qa
```

### New and modified nodes

| Node | Purpose | Response type |
|------|---------|---------------|
| `greeting` | Saludos y conversación general | Direct |
| `agenda` | "Qué tengo pendiente hoy?" (tareas + visitas) | Direct |
| **`query`** | Read queries: products, customers, opportunities, quotes, orders, segments, contacts | Direct |

The `query` node inspects the classified intent to determine which entity type the user is asking about, then invokes the appropriate search/detail tool. The LLM extracts filters (e.g., "cotizaciones de este mes" → `search_quotes({ dateRange: "this_month" })`). Results are formatted as structured cards in the direct response.

| `clarify` | Disambiguate customer references | Direct (question) |
| `extract_intent` | Detect write/create intent | Internal → build_proposal |
| **`modify`** | Modify existing entities (change time, status, etc.) | Internal → build_proposal |
| `build_proposal` | Build structured proposal with blocks | Proposal |
| `refine` | Modify existing proposal | Updated proposal |
| `confirm` | Execute confirmed proposal | Direct confirmation |
| `discard` | Discard proposal | Direct |
| `qa` | General questions not CRUD or agenda | Direct |

### Router classification

The router classifies user input via heuristic patterns + LLM fallback into:

- `greeting` — saludos, despedidas
- `agenda` — pending tasks/visits queries
- `query` — read queries on any entity
- `write` — requests to create something new
- `modify` — requests to change something existing
- `clarify` — response to pending clarification
- `confirm` — confirm a proposal
- `discard` — discard a proposal
- `refine` — modify existing proposal
- `qa` — everything else

### Router classification detail

- **Heuristic pattern matching** handles unambiguous cases: greetings, confirm/discard keywords, agenda keywords ("pendiente", "hoy", "agenda"), and clarification responses.
- **LLM fallback** classifies ambiguous inputs as one of the above intents. The LLM receives the user message, conversation history, and the current `mentionedEntities`/`activeProposalId` context to correctly resolve references like "cambiá la hora" (which requires knowing what entity was last discussed).
- The `modify` intent requires `mentionedEntities` context to know which entity to modify. If the reference is unclear (e.g., "cambiá la hora" with no prior context), the router falls back to `clarify` to disambiguate.

## 2. Tools

### Existing tools (kept)

| Tool | Description |
|------|-------------|
| `search_customers` | Search customers by name |
| `search_opportunities` | Search opportunities |
| `get_customer_details` | Get customer details |
| `get_opportunity_details` | Get opportunity details |
| `get_pending_tasks` | Get user's pending tasks |
| `get_scheduled_visits` | Get user's scheduled visits |
| `create_interaction` | Create a visit interaction |
| `create_followup` | Create a follow-up |
| `create_task` | Create a task |

### New tools

| Tool | Description |
|------|-------------|
| `search_products` | Search products by name/SKU, filter by active |
| `get_product_details` | Get product details by ID |
| `search_quotes` | Search quotes by customer, status |
| `get_quote_details` | Get quote details with items |
| `search_orders` | Search orders by customer, status |
| `get_order_details` | Get order details with items |
| `search_segments` | List/search segments |
| `search_contacts` | Search contacts by name or customer |
| `search_visits` | Search visits by customer, status, date |
| `search_followups` | Search follow-ups by customer, status |
| `get_agenda` | Consolidated: pending tasks + visits |
| `get_dashboard_summary` | Dashboard KPIs |

### New write tools (used by confirm node)

| Tool | Description |
|------|-------------|
| `create_customer` | Create a customer |
| `update_customer` | Update customer data |
| `create_contact` | Create a contact |
| `update_contact` | Update contact data |
| `create_quote` | Create a quote with items |
| `update_quote_status` | Update quote status |
| `create_order` | Create an order (from quote or standalone) |
| `update_order_status` | Update order status/logistics |
| `create_product` | Create a product |
| `update_product` | Update product data |
| `create_segment` | Create a segment |
| `update_segment` | Update segment data |
| `update_visit` | Update visit (reschedule, complete) |
| `update_followup` | Update follow-up (date, status) |
| `update_opportunity` | Update opportunity (stage, value) |

## 3. Proposal Block System

### Current blocks

`interaction`, `opportunity`, `followUp`, `task`, `signals`

### New expanded blocks

| Block | Entity | Actions |
|-------|--------|---------|
| `interaction` | Visit interaction | Create |
| `opportunity` | Commercial opportunity | Create, Update |
| `followUp` | Follow-up task | Create, Update |
| `task` | Generic task | Create, Update |
| `signals` | Sales signals | Create |
| **`customer`** | Customer | Create, Update |
| **`contact`** | Customer contact | Create, Update |
| **`quote`** | Quote | Create, Update |
| **`quoteItem`** | Quote line item | Add, Update, Delete |
| **`order`** | Order | Create, Update |
| **`orderItem`** | Order line item | Add, Update, Delete |
| **`product`** | Product | Create, Update |
| **`segment`** | Customer segment | Create, Update |
| **`visit`** | Visit | Create, Update |
| **`visitUpdate`** | Visit update | Update |

### Block format

```typescript
interface ProposalBlock {
  entity: string;        // "followUp" | "customer" | "quote" | etc.
  action: "create" | "update" | "delete";
  data: Record<string, any>;  // entity data
  enabled: boolean;      // user-toggleable
}
```

### Examples

**Update follow-up time:**
```json
{
  "blocks": [{
    "entity": "followUp",
    "action": "update",
    "data": {
      "id": "abc123",
      "dueAt": "2026-05-10T14:20:00-03:00"
    },
    "enabled": true
  }]
}
```

**Create quote:**
```json
{
  "blocks": [{
    "entity": "quote",
    "action": "create",
    "data": {
      "customerId": "xyz789",
      "items": [{
        "productId": "prod1",
        "quantity": 10,
        "unitPrice": 5000
      }]
    },
    "enabled": true
  }]
}
```

## 4. API Endpoints

### New LauraAgents endpoints (ServiceTokenGuard)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/laura/agents/products` | Search products (filters: search, active) |
| GET | `/laura/agents/products/:id` | Product details |
| GET | `/laura/agents/quotes` | Search quotes (filters: customerId, status) |
| GET | `/laura/agents/quotes/:id` | Quote details with items |
| GET | `/laura/agents/orders` | Search orders (filters: customerId, status) |
| GET | `/laura/agents/orders/:id` | Order details with items |
| GET | `/laura/agents/segments` | List segments |
| GET | `/laura/agents/segments/:id` | Segment details |
| GET | `/laura/agents/contacts` | Search contacts (filters: customerId, search) |
| GET | `/laura/agents/contacts/:id` | Contact details |
| GET | `/laura/agents/visits` | Search visits (filters: customerId, status, date) |
| GET | `/laura/agents/visits/:id` | Visit details |
| GET | `/laura/agents/followups` | Search follow-ups (filters: customerId, status) |
| GET | `/laura/agents/dashboard` | Dashboard summary |
| POST | `/laura/agents/customers` | Create customer |
| PATCH | `/laura/agents/customers/:id` | Update customer |
| POST | `/laura/agents/contacts` | Create contact |
| PATCH | `/laura/agents/contacts/:id` | Update contact |
| POST | `/laura/agents/quotes` | Create quote |
| PATCH | `/laura/agents/quotes/:id` | Update quote status |
| POST | `/laura/agents/quotes/:id/items` | Add quote item |
| PATCH | `/laura/agents/quotes/:id/items/:itemId` | Update quote item |
| DELETE | `/laura/agents/quotes/:id/items/:itemId` | Delete quote item |
| POST | `/laura/agents/orders` | Create order |
| PATCH | `/laura/agents/orders/:id` | Update order status/logistics |
| POST | `/laura/agents/products` | Create product |
| PATCH | `/laura/agents/products/:id` | Update product |
| POST | `/laura/agents/segments` | Create segment |
| PATCH | `/laura/agents/segments/:id` | Update segment |
| PATCH | `/laura/agents/visits/:id` | Update visit (reschedule, complete) |
| PATCH | `/laura/agents/followups/:id` | Update follow-up (date, status) |
| PATCH | `/laura/agents/opportunities/:id` | Update opportunity (stage, value) |

## 5. Conversational Context

### State extension

The LangGraph agent state is extended with context tracking:

```typescript
interface AgentState {
  messages: BaseMessage[];
  sessionId: string;
  userId: string;
  intent: string;
  proposalPayload: ProposalPayload | null;
  clarificationNeeded: any | null;
  // NEW: context tracking
  mentionedEntities: {
    customerId?: string;
    customerName?: string;
    opportunityId?: string;
    quoteId?: string;
    orderId?: string;
    visitId?: string;
    followupId?: string;
    taskId?: string;
  };
  activeProposalId?: string;
  lastAction?: string;
}
```

### Context behavior

- **Entity resolution**: When user mentions "Carlos Mendoza", resolve to `customerId` and store in `mentionedEntities`
- **Active proposal**: If a proposal is pending, `"cambiá la hora"` refers to the entity in the active proposal
- **Last action**: Track last executed action for reference resolution ("hacé lo mismo para el otro cliente")
- **Within-session only**: Context is lost when session ends; no cross-session memory

## 6. Frontend Changes

### Extended components

- **`laura-proposal-block.tsx`** — Render new block types: `customer`, `contact`, `quote`, `order`, `product`, `segment`, `visitUpdate`
- Each new block type gets a specialized render showing relevant fields
- Blocks with `action: "update"` show old vs new values (diff view)
- **`laura-agenda-card.tsx`** — Show richer agenda with more entity types

### Direct response rendering

- Query responses (products list, customer details, etc.) rendered as structured cards, not proposals
- New component: **`laura-data-card.tsx`** for rendering read-only entity data in chat

## 7. Error Handling

- **Entity not found**: Clarification prompt (matches current clarify behavior)
- **Permission denied**: Clear message explaining the user's role doesn't allow this action
- **Validation error**: Proposal shows validation errors inline, user can refine
- **Network error**: Retry with exponential backoff in the agent, surface error if persistent

## 8. Testing Strategy

- Unit tests for each new tool function
- Integration tests for each new API endpoint
- E2E test scenarios:
  - "Qué tengo pendiente hoy?" → Direct agenda response
  - "Cambiá la hora de la tarea a las 14:20" → Proposal to update followUp
  - "Qué productos tenemos?" → Direct product list
  - "Cotización para Carlos Mendoza con 10 bolsas de semilla" → Quote proposal
  - "Cancelá la visita de mañana" → Proposal to cancel visit
  - "Quién es el contacto principal de Agropecuaria Lara?" → Direct customer details