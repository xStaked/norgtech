import type { ProposalPayload } from "./types.js";
import {
  createInteraction,
  createFollowUp,
  createTask,
  upsertOpportunity,
  createCustomer,
  updateCustomer,
  createContact,
  updateContact,
  createQuote,
  updateQuoteStatus,
  createOrder,
  updateOrderStatus,
  createProduct,
  updateProduct,
  createSegment,
  updateSegment,
  updateVisit,
  updateFollowup,
} from "./tools/nestjs-client.js";

export interface ConfirmResult {
  saved: string[];
  discarded: string[];
  createdIds: Record<string, string>;
  errors: Array<{ block: string; message: string }>;
  message: string;
}

type ProposalBlockKey = keyof ProposalPayload["blocks"];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown confirmation error";
}

function relatedToOf(block: unknown): string | undefined {
  if (!block || typeof block !== "object" || !("relatedTo" in block)) {
    return undefined;
  }

  const value = (block as { relatedTo?: unknown }).relatedTo;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function dependencySatisfied(
  block: unknown,
  saved: string[],
  resolvedIds: Partial<Record<ProposalBlockKey, string>>,
): boolean {
  const relatedTo = relatedToOf(block);
  if (!relatedTo) return true;

  return saved.includes(relatedTo)
    || Object.values(resolvedIds).some((value) => value === relatedTo);
}

function inferCustomerId(proposal: ProposalPayload, explicitCustomerId?: string): string {
  return explicitCustomerId
    || proposal.blocks.followUp?.customerId
    || proposal.blocks.task?.customerId
    || proposal.blocks.opportunity?.customerId
    || proposal.blocks.visit?.customerId
    || proposal.blocks.quote?.customerId
    || proposal.blocks.order?.customerId
    || proposal.blocks.contact?.customerId
    || "";
}

export async function handleConfirm(
  proposal: ProposalPayload,
  customerId: string | undefined,
  opportunityId: string | undefined,
): Promise<ConfirmResult> {
  const blocks = proposal.blocks;
  const saved: string[] = [];
  const discarded: string[] = [];
  const createdIds: Record<string, string> = {};
  const errors: Array<{ block: string; message: string }> = [];
  const resolvedIds: Partial<Record<ProposalBlockKey, string>> = {};
  const custId = inferCustomerId(proposal, customerId);

  let oppId = blocks.opportunity?.opportunityId
    ?? opportunityId;

  if (blocks.opportunity?.enabled && custId) {
    if (blocks.opportunity.createNew) {
      try {
        const created = await upsertOpportunity({
          customerId: custId,
          title: blocks.opportunity.title ?? "Seguimiento comercial",
          stage: blocks.opportunity.stage ?? "contacto",
        });
        oppId = created.id;
        saved.push("opportunity");
        createdIds.opportunity = created.id;
        resolvedIds.opportunity = created.id;
      } catch (error) {
        errors.push({ block: "opportunity", message: toErrorMessage(error) });
      }
    } else if (blocks.opportunity.opportunityId && blocks.opportunity.stage) {
      try {
        const updated = await upsertOpportunity({
          customerId: custId,
          title: blocks.opportunity.title ?? "Seguimiento comercial",
          stage: blocks.opportunity.stage,
          opportunityId: blocks.opportunity.opportunityId,
        });
        oppId = updated.id;
        saved.push("opportunity");
        createdIds.opportunity = updated.id;
        resolvedIds.opportunity = updated.id;
      } catch (error) {
        errors.push({ block: "opportunity", message: toErrorMessage(error) });
      }
    } else {
      discarded.push("opportunity");
    }
  }

  if (blocks.interaction?.enabled && custId) {
    if (!dependencySatisfied(blocks.interaction, saved, resolvedIds)) {
      discarded.push("interaction");
    } else {
      try {
        const interaction = await createInteraction({
          customerId: custId,
          summary: blocks.interaction.summary,
          rawMessage: blocks.interaction.rawMessage,
          opportunityId: oppId,
        });
        saved.push("interaction");
        createdIds.interaction = interaction.id;
        resolvedIds.interaction = interaction.id;
      } catch (error) {
        errors.push({ block: "interaction", message: toErrorMessage(error) });
      }
    }
  }

  if (blocks.followUp?.enabled && custId) {
    if (!dependencySatisfied(blocks.followUp, saved, resolvedIds)) {
      discarded.push("followUp");
    } else {
      try {
        const task = await createFollowUp({
          customerId: custId,
          title: blocks.followUp.title!,
          dueAt: blocks.followUp.dueAt!,
          type: blocks.followUp.type!,
          opportunityId: oppId,
        });
        saved.push("followUp");
        createdIds.followUp = task.id;
        resolvedIds.followUp = task.id;
      } catch (error) {
        errors.push({ block: "followUp", message: toErrorMessage(error) });
      }
    }
  }

  if (blocks.task?.enabled && custId) {
    if (!dependencySatisfied(blocks.task, saved, resolvedIds)) {
      discarded.push("task");
    } else {
      try {
        const task = await createTask({
          customerId: custId,
          title: blocks.task.title,
          dueAt: blocks.task.dueAt,
          opportunityId: oppId,
          notes: blocks.task.notes,
        });
        saved.push("task");
        createdIds.task = task.id;
        resolvedIds.task = task.id;
      } catch (error) {
        errors.push({ block: "task", message: toErrorMessage(error) });
      }
    }
  }

  // Customer
  if (proposal.blocks.customer?.enabled) {
    if (proposal.blocks.customer.action === "create") {
      try {
        const created = await createCustomer({
          legalName: proposal.blocks.customer.legalName,
          displayName: proposal.blocks.customer.displayName,
          taxId: proposal.blocks.customer.taxId,
          phone: proposal.blocks.customer.phone,
          email: proposal.blocks.customer.email,
          address: proposal.blocks.customer.address,
          city: proposal.blocks.customer.city,
          department: proposal.blocks.customer.department,
          notes: proposal.blocks.customer.notes,
          segmentId: proposal.blocks.customer.segmentId,
          assignedToUserId: proposal.blocks.customer.assignedToUserId,
        });
        saved.push("customer");
        createdIds.customer = created.id;
        resolvedIds.customer = created.id;
      } catch (error) {
        errors.push({ block: "customer", message: toErrorMessage(error) });
      }
    } else if (proposal.blocks.customer.action === "update" && proposal.blocks.customer.id) {
      try {
        await updateCustomer(proposal.blocks.customer.id, {
          legalName: proposal.blocks.customer.legalName,
          displayName: proposal.blocks.customer.displayName,
          phone: proposal.blocks.customer.phone,
          email: proposal.blocks.customer.email,
          address: proposal.blocks.customer.address,
          notes: proposal.blocks.customer.notes,
        });
        saved.push("customer");
        resolvedIds.customer = proposal.blocks.customer.id;
      } catch (error) {
        errors.push({ block: "customer", message: toErrorMessage(error) });
      }
    }
  }

  // Contact
  if (proposal.blocks.contact?.enabled) {
    if (proposal.blocks.contact.action === "create") {
      if (!dependencySatisfied(proposal.blocks.contact, saved, resolvedIds)) {
        discarded.push("contact");
      } else {
        try {
          const created = await createContact({
            customerId: proposal.blocks.contact.customerId,
            fullName: proposal.blocks.contact.fullName,
            roleTitle: proposal.blocks.contact.roleTitle,
            phone: proposal.blocks.contact.phone,
            email: proposal.blocks.contact.email,
            isPrimary: proposal.blocks.contact.isPrimary,
            notes: proposal.blocks.contact.notes,
          });
          saved.push("contact");
          createdIds.contact = created.id;
          resolvedIds.contact = created.id;
        } catch (error) {
          errors.push({ block: "contact", message: toErrorMessage(error) });
        }
      }
    } else if (proposal.blocks.contact.action === "update" && proposal.blocks.contact.id) {
      if (!dependencySatisfied(proposal.blocks.contact, saved, resolvedIds)) {
        discarded.push("contact");
      } else {
        try {
          await updateContact(proposal.blocks.contact.id, {
            fullName: proposal.blocks.contact.fullName,
            roleTitle: proposal.blocks.contact.roleTitle,
            phone: proposal.blocks.contact.phone,
            email: proposal.blocks.contact.email,
            notes: proposal.blocks.contact.notes,
          });
          saved.push("contact");
          resolvedIds.contact = proposal.blocks.contact.id;
        } catch (error) {
          errors.push({ block: "contact", message: toErrorMessage(error) });
        }
      }
    }
  }

  // Quote
  if (proposal.blocks.quote?.enabled) {
    if (proposal.blocks.quote.action === "create") {
      if (!dependencySatisfied(proposal.blocks.quote, saved, resolvedIds)) {
        discarded.push("quote");
      } else {
        try {
          const created = await createQuote({
            customerId: proposal.blocks.quote.customerId,
            opportunityId: proposal.blocks.quote.opportunityId,
            validUntil: proposal.blocks.quote.validUntil,
            notes: proposal.blocks.quote.notes,
            items: proposal.blocks.quote.items ?? [],
          });
          saved.push("quote");
          createdIds.quote = created.id;
          resolvedIds.quote = created.id;
        } catch (error) {
          errors.push({ block: "quote", message: toErrorMessage(error) });
        }
      }
    } else if (proposal.blocks.quote.action === "update" && proposal.blocks.quote.id) {
      if (!dependencySatisfied(proposal.blocks.quote, saved, resolvedIds)) {
        discarded.push("quote");
      } else {
        try {
          await updateQuoteStatus(proposal.blocks.quote.id, { status: "abierta" });
          saved.push("quote");
          resolvedIds.quote = proposal.blocks.quote.id;
        } catch (error) {
          errors.push({ block: "quote", message: toErrorMessage(error) });
        }
      }
    }
  }

  // Order
  if (proposal.blocks.order?.enabled) {
    if (proposal.blocks.order.action === "create") {
      if (!dependencySatisfied(proposal.blocks.order, saved, resolvedIds)) {
        discarded.push("order");
      } else {
        try {
          const created = await createOrder({
            customerId: proposal.blocks.order.customerId,
            opportunityId: proposal.blocks.order.opportunityId,
            sourceQuoteId: proposal.blocks.order.sourceQuoteId,
            notes: proposal.blocks.order.notes,
            items: proposal.blocks.order.items ?? [],
          });
          saved.push("order");
          createdIds.order = created.id;
          resolvedIds.order = created.id;
        } catch (error) {
          errors.push({ block: "order", message: toErrorMessage(error) });
        }
      }
    } else if (proposal.blocks.order.action === "update" && proposal.blocks.order.id) {
      if (!dependencySatisfied(proposal.blocks.order, saved, resolvedIds)) {
        discarded.push("order");
      } else {
        try {
          await updateOrderStatus(proposal.blocks.order.id, { status: "recibido" });
          saved.push("order");
          resolvedIds.order = proposal.blocks.order.id;
        } catch (error) {
          errors.push({ block: "order", message: toErrorMessage(error) });
        }
      }
    }
  }

  // Product
  if (proposal.blocks.product?.enabled) {
    if (proposal.blocks.product.action === "create") {
      if (!dependencySatisfied(proposal.blocks.product, saved, resolvedIds)) {
        discarded.push("product");
      } else {
        try {
          const created = await createProduct({
            sku: proposal.blocks.product.sku,
            name: proposal.blocks.product.name,
            description: proposal.blocks.product.description,
            unit: proposal.blocks.product.unit,
            presentation: proposal.blocks.product.presentation,
            basePrice: proposal.blocks.product.basePrice,
          });
          saved.push("product");
          createdIds.product = created.id;
          resolvedIds.product = created.id;
        } catch (error) {
          errors.push({ block: "product", message: toErrorMessage(error) });
        }
      }
    } else if (proposal.blocks.product.action === "update" && proposal.blocks.product.id) {
      if (!dependencySatisfied(proposal.blocks.product, saved, resolvedIds)) {
        discarded.push("product");
      } else {
        try {
          await updateProduct(proposal.blocks.product.id, {
            name: proposal.blocks.product.name,
            sku: proposal.blocks.product.sku,
            description: proposal.blocks.product.description,
            basePrice: proposal.blocks.product.basePrice,
          });
          saved.push("product");
          resolvedIds.product = proposal.blocks.product.id;
        } catch (error) {
          errors.push({ block: "product", message: toErrorMessage(error) });
        }
      }
    }
  }

  // Segment
  if (proposal.blocks.segment?.enabled) {
    if (proposal.blocks.segment.action === "create") {
      if (!dependencySatisfied(proposal.blocks.segment, saved, resolvedIds)) {
        discarded.push("segment");
      } else {
        try {
          const created = await createSegment({
            name: proposal.blocks.segment.name,
            description: proposal.blocks.segment.description,
          });
          saved.push("segment");
          createdIds.segment = created.id;
          resolvedIds.segment = created.id;
        } catch (error) {
          errors.push({ block: "segment", message: toErrorMessage(error) });
        }
      }
    } else if (proposal.blocks.segment.action === "update" && proposal.blocks.segment.id) {
      if (!dependencySatisfied(proposal.blocks.segment, saved, resolvedIds)) {
        discarded.push("segment");
      } else {
        try {
          await updateSegment(proposal.blocks.segment.id, {
            name: proposal.blocks.segment.name,
            description: proposal.blocks.segment.description,
          });
          saved.push("segment");
          resolvedIds.segment = proposal.blocks.segment.id;
        } catch (error) {
          errors.push({ block: "segment", message: toErrorMessage(error) });
        }
      }
    }
  }

  // Visit update (only updates, not create — creation is handled by interaction block)
  if (proposal.blocks.visit?.enabled && proposal.blocks.visit.action === "update" && proposal.blocks.visit.id) {
    if (!dependencySatisfied(proposal.blocks.visit, saved, resolvedIds)) {
      discarded.push("visit");
    } else {
      try {
        await updateVisit(proposal.blocks.visit.id, {
          scheduledAt: proposal.blocks.visit.scheduledAt,
          summary: proposal.blocks.visit.summary,
          notes: proposal.blocks.visit.notes,
        });
        saved.push("visit");
        resolvedIds.visit = proposal.blocks.visit.id;
      } catch (error) {
        errors.push({ block: "visit", message: toErrorMessage(error) });
      }
    }
  }

  // FollowUp update (for modify actions where we update instead of create)
  if (proposal.blocks.followUp?.enabled && proposal.blocks.followUp.action === "update" && proposal.blocks.followUp.id) {
    if (!dependencySatisfied(proposal.blocks.followUp, saved, resolvedIds)) {
      discarded.push("followUp");
    } else {
      try {
        await updateFollowup(proposal.blocks.followUp.id, {
          dueAt: proposal.blocks.followUp.dueAt,
          title: proposal.blocks.followUp.title,
          notes: proposal.blocks.followUp.notes,
        });
        saved.push("followup");
        resolvedIds.followUp = proposal.blocks.followUp.id;
      } catch (error) {
        errors.push({ block: "followUp", message: toErrorMessage(error) });
      }
    }
  }

  const message = `Laura guardó ${saved.length} bloques${discarded.length > 0 ? ` y descartó ${discarded.length}` : ""}${errors.length > 0 ? ` con ${errors.length} error${errors.length === 1 ? "" : "es"}` : ""}.`;

  return { saved, discarded, createdIds, errors, message };
}
