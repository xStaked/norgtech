import type { ProposalBlockAction, ProposalPayload, QuoteBlock } from "../types.js";
import type { PlannedAction } from "./types.js";

type Args = Record<string, unknown>;

const READ_ACTIONS = new Set(["search", "detail"]);

function stringArg(args: Args, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function optionalStringArg(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function numberArg(args: Args, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" ? value : undefined;
}

function booleanArg(args: Args, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function itemsArg(args: Args): QuoteBlock["items"] {
  const value = args.items;
  return Array.isArray(value) ? value as QuoteBlock["items"] : undefined;
}

function proposalAction(action: PlannedAction): ProposalBlockAction | null {
  if (action.action === "create") return "create";
  if (action.action === "update" || action.action === "change_status" || action.action === "add_item" || action.action === "cancel" || action.action === "complete") {
    return "update";
  }
  if (action.action === "bulk_delete") return "delete";
  return null;
}

function hasRequiredFields(action: PlannedAction): boolean {
  if (action.missingFields.length > 0) return false;
  return action.requiredFields.every((field) => action.arguments[field] !== undefined && action.arguments[field] !== null);
}

export function buildProposalFromActions(actions: PlannedAction[]): ProposalPayload {
  const blocks: ProposalPayload["blocks"] = {};

  for (const action of actions) {
    if (READ_ACTIONS.has(action.action)) continue;
    if (!hasRequiredFields(action)) continue;

    const blockAction = proposalAction(action);
    if (!blockAction) continue;

    const args = action.arguments;

    switch (action.domain) {
      case "customers":
        blocks.customer = {
          legalName: stringArg(args, "legalName"),
          displayName: optionalStringArg(args, "displayName"),
          taxId: optionalStringArg(args, "taxId"),
          phone: optionalStringArg(args, "phone"),
          email: optionalStringArg(args, "email"),
          address: optionalStringArg(args, "address"),
          city: optionalStringArg(args, "city"),
          department: optionalStringArg(args, "department"),
          notes: optionalStringArg(args, "notes"),
          segmentId: optionalStringArg(args, "segmentId"),
          assignedToUserId: optionalStringArg(args, "assignedToUserId"),
          enabled: true,
          action: blockAction,
          id: optionalStringArg(args, "customerId") ?? optionalStringArg(args, "id"),
        };
        break;
      case "contacts":
        blocks.contact = {
          customerId: stringArg(args, "customerId"),
          fullName: stringArg(args, "fullName"),
          roleTitle: optionalStringArg(args, "roleTitle"),
          phone: optionalStringArg(args, "phone"),
          email: optionalStringArg(args, "email"),
          isPrimary: booleanArg(args, "isPrimary"),
          notes: optionalStringArg(args, "notes"),
          enabled: true,
          action: blockAction,
          id: optionalStringArg(args, "contactId") ?? optionalStringArg(args, "id"),
        };
        break;
      case "opportunities":
        blocks.opportunity = {
          title: stringArg(args, "title"),
          stage: stringArg(args, "stage"),
          estimatedValue: numberArg(args, "estimatedValue"),
          expectedCloseDate: optionalStringArg(args, "expectedCloseDate"),
          createNew: blockAction === "create",
          opportunityId: optionalStringArg(args, "opportunityId") ?? optionalStringArg(args, "id"),
          enabled: true,
          action: blockAction,
        };
        break;
      case "quotes":
        blocks.quote = {
          customerId: stringArg(args, "customerId"),
          opportunityId: optionalStringArg(args, "opportunityId"),
          validUntil: optionalStringArg(args, "validUntil"),
          notes: optionalStringArg(args, "notes"),
          items: itemsArg(args),
          enabled: true,
          action: blockAction,
          id: optionalStringArg(args, "quoteId") ?? optionalStringArg(args, "id"),
        };
        break;
      case "orders":
        blocks.order = {
          customerId: stringArg(args, "customerId"),
          opportunityId: optionalStringArg(args, "opportunityId"),
          sourceQuoteId: optionalStringArg(args, "sourceQuoteId"),
          notes: optionalStringArg(args, "notes"),
          items: itemsArg(args),
          enabled: true,
          action: blockAction,
          id: optionalStringArg(args, "orderId") ?? optionalStringArg(args, "id"),
        };
        break;
      case "products":
        blocks.product = {
          sku: stringArg(args, "sku"),
          name: stringArg(args, "name"),
          description: optionalStringArg(args, "description"),
          unit: optionalStringArg(args, "unit"),
          presentation: optionalStringArg(args, "presentation"),
          basePrice: numberArg(args, "basePrice"),
          enabled: true,
          action: blockAction,
          id: optionalStringArg(args, "productId") ?? optionalStringArg(args, "id"),
        };
        break;
      case "segments":
        blocks.segment = {
          name: stringArg(args, "name"),
          description: optionalStringArg(args, "description"),
          enabled: true,
          action: blockAction,
          id: optionalStringArg(args, "segmentId") ?? optionalStringArg(args, "id"),
        };
        break;
      case "visits":
        blocks.visit = {
          customerId: stringArg(args, "customerId"),
          opportunityId: optionalStringArg(args, "opportunityId"),
          scheduledAt: stringArg(args, "scheduledAt"),
          summary: optionalStringArg(args, "summary"),
          notes: optionalStringArg(args, "notes"),
          enabled: true,
          action: blockAction,
          id: optionalStringArg(args, "visitId") ?? optionalStringArg(args, "id"),
        };
        break;
      case "followups":
        blocks.followUp = {
          title: stringArg(args, "title"),
          type: stringArg(args, "type"),
          dueAt: stringArg(args, "dueAt"),
          notes: optionalStringArg(args, "notes"),
          enabled: true,
          action: blockAction,
          id: optionalStringArg(args, "followupId") ?? optionalStringArg(args, "id"),
        };
        break;
    }
  }

  return { blocks };
}
