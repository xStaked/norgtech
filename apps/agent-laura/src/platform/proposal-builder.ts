import type {
  ContactBlock,
  CustomerBlock,
  FollowUpBlock,
  OpportunityBlock,
  OrderBlock,
  ProductBlock,
  ProposalBlockAction,
  ProposalPayload,
  ProposalSummary,
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

function hasAnyArg(args: Args, fields: string[]): boolean {
  return fields.some((field) => {
    const value = args[field];
    if (value == null) return false;
    return typeof value !== "string" || value.trim().length > 0;
  });
}

function entityId(args: Args, ...fields: string[]): string | undefined {
  for (const field of fields) {
    const value = optionalStringArg(args, field);
    if (value && value.trim().length > 0) return value;
  }
  return undefined;
}

function enabledForWrite(
  action: PlannedAction,
  createRequiredFields: string[],
  updateIdFields: string[],
  updateMutableFields: string[],
): boolean {
  if (action.action === "create") {
    return createRequiredFields.every((field) => requiredStringArg(action.arguments, field) !== null);
  }

  if (action.action === "update" || action.action === "change_status" || action.action === "add_item" || action.action === "cancel" || action.action === "complete") {
    return entityId(action.arguments, ...updateIdFields) !== undefined
      && hasAnyArg(action.arguments, updateMutableFields);
  }

  return hasRequiredFields(action);
}

function proposalLabel(action: PlannedAction): string {
  const label = action.humanSummary?.trim();
  return label && label.length > 0 ? label : `${action.action}:${action.domain}`;
}

function appendSummaryAction(summary: ProposalSummary, action: PlannedAction): void {
  const actionKey = `${action.domain}.${action.action}`;
  summary.labels.push(proposalLabel(action));
  if (action.role === "related") {
    summary.relatedCount += 1;
    summary.relatedActions.push(actionKey);
    if (typeof action.relatedTo === "string" && action.relatedTo.length > 0) {
      summary.relatedToIds.push(action.relatedTo);
    }
    return;
  }

  summary.primaryCount += 1;
  summary.primaryActions.push(actionKey);
}

function createProposalSummary(): ProposalSummary {
  return {
    primaryCount: 0,
    relatedCount: 0,
    primaryActions: [],
    relatedActions: [],
    relatedToIds: [],
    labels: [],
  };
}

export function buildProposalFromActions(actions: PlannedAction[]): ProposalPayload {
  const blocks: ProposalPayload["blocks"] = {};
  const summary = createProposalSummary();

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
          enabled: enabledForWrite(action, ["legalName"], ["customerId", "id"], [
            "legalName",
            "displayName",
            "taxId",
            "phone",
            "email",
            "address",
            "city",
            "department",
            "notes",
            "segmentId",
            "assignedToUserId",
          ]),
          action: blockAction,
          id: entityId(args, "customerId", "id"),
        });
        if (blocks.customer.enabled) appendSummaryAction(summary, action);
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
          enabled: enabledForWrite(action, ["customerId", "fullName"], ["contactId", "id"], [
            "customerId",
            "fullName",
            "roleTitle",
            "phone",
            "email",
            "isPrimary",
            "notes",
          ]),
          action: blockAction,
          id: entityId(args, "contactId", "id"),
        });
        if (blocks.contact.enabled) appendSummaryAction(summary, action);
        break;
      }
      case "opportunities": {
        const title = requiredStringArg(args, "title");
        const stage = requiredStringArg(args, "stage");
        blocks.opportunity = proposalBlock<OpportunityBlock>({
          customerId: optionalStringArg(args, "customerId"),
          ...(title ? { title } : {}),
          ...(stage ? { stage } : {}),
          estimatedValue: numberArg(args, "estimatedValue"),
          expectedCloseDate: optionalStringArg(args, "expectedCloseDate"),
          createNew: blockAction === "create",
          opportunityId: entityId(args, "opportunityId", "id"),
          enabled: enabledForWrite(action, ["customerId", "title", "stage"], ["opportunityId", "id"], [
            "title",
            "stage",
            "estimatedValue",
            "expectedCloseDate",
            "customerId",
          ]),
          action: blockAction,
        });
        if (blocks.opportunity.enabled) appendSummaryAction(summary, action);
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
          enabled: !items.malformed && enabledForWrite(action, ["customerId"], ["quoteId", "id"], [
            "customerId",
            "opportunityId",
            "validUntil",
            "notes",
            "items",
            "status",
          ]),
          action: blockAction,
          id: entityId(args, "quoteId", "id"),
        });
        if (blocks.quote.enabled) appendSummaryAction(summary, action);
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
          enabled: !items.malformed && enabledForWrite(action, ["customerId"], ["orderId", "id"], [
            "customerId",
            "opportunityId",
            "sourceQuoteId",
            "notes",
            "items",
            "status",
          ]),
          action: blockAction,
          id: entityId(args, "orderId", "id"),
        });
        if (blocks.order.enabled) appendSummaryAction(summary, action);
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
          enabled: enabledForWrite(action, ["sku", "name"], ["productId", "id"], [
            "sku",
            "name",
            "description",
            "unit",
            "presentation",
            "basePrice",
          ]),
          action: blockAction,
          id: entityId(args, "productId", "id"),
        });
        if (blocks.product.enabled) appendSummaryAction(summary, action);
        break;
      }
      case "segments": {
        const name = requiredStringArg(args, "name");
        blocks.segment = proposalBlock<SegmentBlock>({
          ...(name ? { name } : {}),
          description: optionalStringArg(args, "description"),
          enabled: enabledForWrite(action, ["name"], ["segmentId", "id"], ["name", "description"]),
          action: blockAction,
          id: entityId(args, "segmentId", "id"),
        });
        if (blocks.segment.enabled) appendSummaryAction(summary, action);
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
          enabled: enabledForWrite(action, ["customerId", "scheduledAt"], ["visitId", "id"], [
            "customerId",
            "opportunityId",
            "scheduledAt",
            "summary",
            "notes",
          ]),
          action: blockAction,
          id: entityId(args, "visitId", "id"),
        });
        if (blocks.visit.enabled) appendSummaryAction(summary, action);
        break;
      }
      case "followups": {
        const title = requiredStringArg(args, "title");
        const type = requiredStringArg(args, "type");
        const dueAt = requiredStringArg(args, "dueAt");
        blocks.followUp = proposalBlock<FollowUpBlock>({
          customerId: optionalStringArg(args, "customerId"),
          ...(title ? { title } : {}),
          ...(type ? { type } : {}),
          ...(dueAt ? { dueAt } : {}),
          notes: optionalStringArg(args, "notes"),
          opportunityId: optionalStringArg(args, "opportunityId"),
          enabled: enabledForWrite(action, ["customerId", "title", "dueAt", "type"], ["followupId", "id"], [
            "customerId",
            "opportunityId",
            "title",
            "dueAt",
            "type",
            "notes",
          ]),
          action: blockAction,
          id: entityId(args, "followupId", "id"),
        });
        if (blocks.followUp.enabled) appendSummaryAction(summary, action);
        break;
      }
    }
  }

  return {
    blocks,
    summary: {
      ...summary,
      relatedToIds: Array.from(new Set(summary.relatedToIds)),
    },
  };
}
