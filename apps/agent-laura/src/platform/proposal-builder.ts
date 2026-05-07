import type {
  ContactBlock,
  CustomerBlock,
  FollowUpBlock,
  OpportunityBlock,
  OrderBlock,
  ProductBlock,
  ProposalBlockAction,
  ProposalPayload,
  QuoteBlock,
  SegmentBlock,
  VisitBlock,
} from "../types.js";
import type { PlannedAction } from "./types.js";

type Args = Record<string, unknown>;
type LineItems = NonNullable<QuoteBlock["items"]>;

const READ_ACTIONS = new Set(["search", "detail"]);

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

function proposalBlock<T extends { enabled: boolean }>(value: Partial<T> & Pick<T, "enabled">): T {
  return value as T;
}

function requiredStringArg(args: Args, key: string): string | null {
  const value = optionalStringArg(args, key);
  return value && value.trim().length > 0 ? value : null;
}

function itemArg(value: unknown): LineItems[number] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (
    typeof record.productId !== "string" ||
    typeof record.quantity !== "number" ||
    typeof record.unitPrice !== "number"
  ) {
    return null;
  }

  return {
    productId: record.productId,
    quantity: record.quantity,
    unitPrice: record.unitPrice,
    notes: typeof record.notes === "string" ? record.notes : undefined,
  };
}

function itemsArg(args: Args): { items?: LineItems; malformed: boolean } {
  const value = args.items;
  if (value === undefined) return { malformed: false };
  if (!Array.isArray(value)) return { malformed: true };

  const items = value.map(itemArg).filter((item): item is LineItems[number] => item !== null);
  return {
    items: items.length > 0 ? items : undefined,
    malformed: items.length !== value.length,
  };
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
      case "customers": {
        const legalName = requiredStringArg(args, "legalName");
        blocks.customer = proposalBlock<CustomerBlock>({
          ...(legalName ? { legalName } : {}),
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
          enabled: legalName !== null,
          action: blockAction,
          id: optionalStringArg(args, "customerId") ?? optionalStringArg(args, "id"),
        });
        break;
      }
      case "contacts": {
        const customerId = requiredStringArg(args, "customerId");
        const fullName = requiredStringArg(args, "fullName");
        blocks.contact = proposalBlock<ContactBlock>({
          ...(customerId ? { customerId } : {}),
          ...(fullName ? { fullName } : {}),
          roleTitle: optionalStringArg(args, "roleTitle"),
          phone: optionalStringArg(args, "phone"),
          email: optionalStringArg(args, "email"),
          isPrimary: booleanArg(args, "isPrimary"),
          notes: optionalStringArg(args, "notes"),
          enabled: customerId !== null && fullName !== null,
          action: blockAction,
          id: optionalStringArg(args, "contactId") ?? optionalStringArg(args, "id"),
        });
        break;
      }
      case "opportunities": {
        const title = requiredStringArg(args, "title");
        const stage = requiredStringArg(args, "stage");
        blocks.opportunity = proposalBlock<OpportunityBlock>({
          ...(title ? { title } : {}),
          ...(stage ? { stage } : {}),
          estimatedValue: numberArg(args, "estimatedValue"),
          expectedCloseDate: optionalStringArg(args, "expectedCloseDate"),
          createNew: blockAction === "create",
          opportunityId: optionalStringArg(args, "opportunityId") ?? optionalStringArg(args, "id"),
          enabled: title !== null && stage !== null,
          action: blockAction,
        });
        break;
      }
      case "quotes": {
        const customerId = requiredStringArg(args, "customerId");
        const items = itemsArg(args);
        blocks.quote = proposalBlock<QuoteBlock>({
          ...(customerId ? { customerId } : {}),
          opportunityId: optionalStringArg(args, "opportunityId"),
          validUntil: optionalStringArg(args, "validUntil"),
          notes: optionalStringArg(args, "notes"),
          items: items.items,
          enabled: customerId !== null && !items.malformed,
          action: blockAction,
          id: optionalStringArg(args, "quoteId") ?? optionalStringArg(args, "id"),
        });
        break;
      }
      case "orders": {
        const customerId = requiredStringArg(args, "customerId");
        const items = itemsArg(args);
        blocks.order = proposalBlock<OrderBlock>({
          ...(customerId ? { customerId } : {}),
          opportunityId: optionalStringArg(args, "opportunityId"),
          sourceQuoteId: optionalStringArg(args, "sourceQuoteId"),
          notes: optionalStringArg(args, "notes"),
          items: items.items,
          enabled: customerId !== null && !items.malformed,
          action: blockAction,
          id: optionalStringArg(args, "orderId") ?? optionalStringArg(args, "id"),
        });
        break;
      }
      case "products": {
        const sku = requiredStringArg(args, "sku");
        const name = requiredStringArg(args, "name");
        blocks.product = proposalBlock<ProductBlock>({
          ...(sku ? { sku } : {}),
          ...(name ? { name } : {}),
          description: optionalStringArg(args, "description"),
          unit: optionalStringArg(args, "unit"),
          presentation: optionalStringArg(args, "presentation"),
          basePrice: numberArg(args, "basePrice"),
          enabled: sku !== null && name !== null,
          action: blockAction,
          id: optionalStringArg(args, "productId") ?? optionalStringArg(args, "id"),
        });
        break;
      }
      case "segments": {
        const name = requiredStringArg(args, "name");
        blocks.segment = proposalBlock<SegmentBlock>({
          ...(name ? { name } : {}),
          description: optionalStringArg(args, "description"),
          enabled: name !== null,
          action: blockAction,
          id: optionalStringArg(args, "segmentId") ?? optionalStringArg(args, "id"),
        });
        break;
      }
      case "visits": {
        const customerId = requiredStringArg(args, "customerId");
        const scheduledAt = requiredStringArg(args, "scheduledAt");
        blocks.visit = proposalBlock<VisitBlock>({
          ...(customerId ? { customerId } : {}),
          opportunityId: optionalStringArg(args, "opportunityId"),
          ...(scheduledAt ? { scheduledAt } : {}),
          summary: optionalStringArg(args, "summary"),
          notes: optionalStringArg(args, "notes"),
          enabled: customerId !== null && scheduledAt !== null,
          action: blockAction,
          id: optionalStringArg(args, "visitId") ?? optionalStringArg(args, "id"),
        });
        break;
      }
      case "followups": {
        const title = requiredStringArg(args, "title");
        const type = requiredStringArg(args, "type");
        const dueAt = requiredStringArg(args, "dueAt");
        blocks.followUp = proposalBlock<FollowUpBlock>({
          ...(title ? { title } : {}),
          ...(type ? { type } : {}),
          ...(dueAt ? { dueAt } : {}),
          notes: optionalStringArg(args, "notes"),
          enabled: title !== null && type !== null && dueAt !== null,
          action: blockAction,
          id: optionalStringArg(args, "followupId") ?? optionalStringArg(args, "id"),
        });
        break;
      }
    }
  }

  return { blocks };
}
