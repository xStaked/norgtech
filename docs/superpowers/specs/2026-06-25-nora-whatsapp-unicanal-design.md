# Nora WhatsApp Unicanal MVP Design

## Context

The client meeting from 2026-05-22 established WhatsApp as a central operating channel for Norgtech. The requested direction is not only an assistant that answers messages, but a unichannel inbox managed by an administrative sales user, with Nora helping classify messages, collect missing data, and prepare operational cases.

The current codebase already includes a WhatsApp inbox, Kapso webhook ingestion, Nora action logs, conversation cases, order automation, expense extraction, and separate Nora agents for general/commercial and customer WhatsApp modes. This design builds on those foundations.

## Goal

Build the first MVP of an assisted WhatsApp unichannel: an admin user can manage inbound WhatsApp conversations in a clear inbox while Nora classifies messages, summarizes context, creates or updates order cases, asks for missing data, and prepares a basic order for human review.

## MVP Scope

- WhatsApp conversation inbox for unichannel/admin users.
- Conversation states: `nuevo`, `pendiente`, `en_gestion`, `resuelto`.
- Conversation assignment to the unichannel/admin user.
- Internal notes on conversations.
- Conversation intent/tag labels: `pedido`, `cartera`, `logistica`, `gasto`, `reclamo`, `otro`.
- Short Nora-generated operational summary.
- Basic WhatsApp order case with customer, billing company, customer zone/site, product lines, quantities, and review status.
- Admin action to create a CRM order in review from a complete WhatsApp order case.
- Controlled Nora replies that ask for missing information but do not approve, invoice, or dispatch orders autonomously.

## Out of Scope

- Automatic payment support reconciliation against invoices.
- Automatic logistics guide linking against orders.
- Complex complaint workflows.
- Fully autonomous approval, invoicing, or dispatch.
- Advanced SLA configuration and analytics.

## Existing Components to Reuse

- `KapsoWebhookService` persists inbound WhatsApp messages.
- `NoraRoutingService` classifies inbound messages, creates Nora action logs, and manages case transitions.
- `NoraConversationCase` stores operational case state.
- `WhatsAppOrderAutomationService` resolves customer, company, zone, and products, then creates draft/review orders.
- The web app already has API client patterns and app-shell conventions to follow for the inbox UI.

## Architecture

Inbound WhatsApp messages continue to enter through the existing Kapso webhook. After persistence, Nora routing classifies the message and produces a structured output. The output may update conversation identity, create or update a Nora case, propose a reply, or mark the conversation for human attention.

The unichannel inbox becomes the primary human control surface. It reads conversations, messages, internal notes, Nora action logs, and open cases. The inbox shows Nora's summary and extracted fields, but the admin remains responsible for executing high-risk business actions.

Order creation from WhatsApp is handled through an explicit review action. A complete order case can be processed into an order with `approvalStatus: en_revision`, associated back to the WhatsApp conversation.

## Data Flow

1. A customer or commercial user sends a WhatsApp message.
2. `KapsoWebhookService` stores the inbound message and updates the conversation.
3. `NoraRoutingService` resolves sender identity and loads conversation context.
4. Nora classifies the message and creates or updates a case when appropriate.
5. For order messages, Nora extracts customer, company, zone/site, items, quantities, and notes.
6. If required fields are missing, Nora replies asking for the next missing field.
7. When the order case is complete, the case status becomes ready for review.
8. The unichannel/admin user reviews the case in the inbox.
9. The admin creates a CRM order from the case.
10. The order is linked to the WhatsApp conversation and the system sends a controlled confirmation reply.
11. The conversation can be marked as resolved after the operational action is complete.

## UI Design

The inbox should be a dense operations screen, not a marketing page. It should use a three-area layout:

- Left panel: conversation list with sender, last message, status, assigned user, intent, and unread/needs-review signal.
- Center panel: message timeline with inbound/outbound messages and internal notes.
- Right panel: Nora summary, open case details, missing fields, proposed action, and action buttons.

Primary actions:

- Assign conversation.
- Change status.
- Add internal note.
- Send WhatsApp reply.
- Create order from complete case.
- Mark conversation resolved.

The right panel must make missing fields obvious. For an order case, it should show customer, billing company, zone/site, items, quantities, and unresolved products.

## Nora Behavior

Nora should act as an operations assistant:

- Classify conversation intent.
- Summarize the operational need in one or two sentences.
- Start or update an order case.
- Ask only one clear missing-data question at a time when possible.
- Avoid approving, invoicing, dispatching, or promising fulfillment.
- Escalate ambiguous or risky cases to human review.

For the MVP, Nora's autonomous outbound replies are allowed only for low-risk clarification and receipt acknowledgements.

## Error Handling

- If Nora routing fails, the message remains visible in the inbox and the action log records the failure.
- If a reply cannot be sent through Kapso, the message/action log records the send error and the conversation remains pending.
- If product, customer, company, or zone resolution is ambiguous, the case remains in review or collecting-info state.
- If order creation fails, no conversation state should be marked resolved automatically.

## Testing

Backend tests should cover:

- Inbound WhatsApp message creates or updates a conversation.
- Pedido intent creates an order case.
- Missing customer/company/zone/items produces a clarification reply.
- Complete order case can create an order in review.
- Ambiguous product/customer resolution remains human-reviewable.
- Failed Nora route or failed send is recorded without losing the message.

Frontend verification should cover:

- Conversation list renders status, assignment, intent, and last message.
- Conversation detail renders messages, notes, Nora summary, and case details.
- Admin can update status, add note, send reply, and create order from a complete case.

## Acceptance Criteria

- A WhatsApp order message appears in the unichannel inbox.
- The inbox shows intent `pedido`, Nora summary, and extracted order data.
- Nora asks for missing company, zone/site, customer, or item data when required.
- A complete order case can be reviewed by admin and converted into an order with review status.
- The created order is linked to the WhatsApp conversation.
- The conversation can be marked as resolved after action.
- Nora action logs preserve classification, proposed replies, case changes, and execution result.

