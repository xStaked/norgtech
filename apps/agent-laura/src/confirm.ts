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
  message: string;
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
  const custId = customerId ?? "";

  let oppId = blocks.opportunity?.opportunityId
    ?? opportunityId;

  if (blocks.opportunity?.enabled && custId) {
    if (blocks.opportunity.createNew) {
      const created = await upsertOpportunity({
        customerId: custId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage ?? "contacto",
      });
      oppId = created.id;
      saved.push("opportunity");
      createdIds.opportunity = created.id;
    } else if (blocks.opportunity.opportunityId && blocks.opportunity.stage) {
      const updated = await upsertOpportunity({
        customerId: custId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage,
        opportunityId: blocks.opportunity.opportunityId,
      });
      oppId = updated.id;
      saved.push("opportunity");
      createdIds.opportunity = updated.id;
    } else {
      discarded.push("opportunity");
    }
  }

  if (blocks.interaction?.enabled && custId) {
    const interaction = await createInteraction({
      customerId: custId,
      summary: blocks.interaction.summary,
      rawMessage: blocks.interaction.rawMessage,
      opportunityId: oppId,
    });
    saved.push("interaction");
    createdIds.interaction = interaction.id;
  }

  if (blocks.followUp?.enabled && custId) {
    const task = await createFollowUp({
      customerId: custId,
      title: blocks.followUp.title,
      dueAt: blocks.followUp.dueAt,
      type: blocks.followUp.type,
      opportunityId: oppId,
    });
    saved.push("followUp");
    createdIds.followUp = task.id;
  }

  if (blocks.task?.enabled && custId) {
    const task = await createTask({
      customerId: custId,
      title: blocks.task.title,
      dueAt: blocks.task.dueAt,
      opportunityId: oppId,
      notes: blocks.task.notes,
    });
    saved.push("task");
    createdIds.task = task.id;
  }

  // Customer
  if (proposal.blocks.customer?.enabled) {
    if (proposal.blocks.customer.action === "create") {
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
      createdIds["customer"] = created.id;
    } else if (proposal.blocks.customer.action === "update" && proposal.blocks.customer.id) {
      await updateCustomer(proposal.blocks.customer.id, {
        legalName: proposal.blocks.customer.legalName,
        displayName: proposal.blocks.customer.displayName,
        phone: proposal.blocks.customer.phone,
        email: proposal.blocks.customer.email,
        address: proposal.blocks.customer.address,
        notes: proposal.blocks.customer.notes,
      });
      saved.push("customer");
    }
  }

  // Contact
  if (proposal.blocks.contact?.enabled) {
    if (proposal.blocks.contact.action === "create") {
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
      createdIds["contact"] = created.id;
    } else if (proposal.blocks.contact.action === "update" && proposal.blocks.contact.id) {
      await updateContact(proposal.blocks.contact.id, {
        fullName: proposal.blocks.contact.fullName,
        roleTitle: proposal.blocks.contact.roleTitle,
        phone: proposal.blocks.contact.phone,
        email: proposal.blocks.contact.email,
        notes: proposal.blocks.contact.notes,
      });
      saved.push("contact");
    }
  }

  // Quote
  if (proposal.blocks.quote?.enabled) {
    if (proposal.blocks.quote.action === "create") {
      const created = await createQuote({
        customerId: proposal.blocks.quote.customerId,
        opportunityId: proposal.blocks.quote.opportunityId,
        validUntil: proposal.blocks.quote.validUntil,
        notes: proposal.blocks.quote.notes,
        items: proposal.blocks.quote.items ?? [],
      });
      saved.push("quote");
      createdIds["quote"] = created.id;
    } else if (proposal.blocks.quote.action === "update" && proposal.blocks.quote.id) {
      await updateQuoteStatus(proposal.blocks.quote.id, { status: "abierta" });
      saved.push("quote");
    }
  }

  // Order
  if (proposal.blocks.order?.enabled) {
    if (proposal.blocks.order.action === "create") {
      const created = await createOrder({
        customerId: proposal.blocks.order.customerId,
        opportunityId: proposal.blocks.order.opportunityId,
        sourceQuoteId: proposal.blocks.order.sourceQuoteId,
        notes: proposal.blocks.order.notes,
        items: proposal.blocks.order.items ?? [],
      });
      saved.push("order");
      createdIds["order"] = created.id;
    } else if (proposal.blocks.order.action === "update" && proposal.blocks.order.id) {
      await updateOrderStatus(proposal.blocks.order.id, { status: "recibido" });
      saved.push("order");
    }
  }

  // Product
  if (proposal.blocks.product?.enabled) {
    if (proposal.blocks.product.action === "create") {
      const created = await createProduct({
        sku: proposal.blocks.product.sku,
        name: proposal.blocks.product.name,
        description: proposal.blocks.product.description,
        unit: proposal.blocks.product.unit,
        presentation: proposal.blocks.product.presentation,
        basePrice: proposal.blocks.product.basePrice,
      });
      saved.push("product");
      createdIds["product"] = created.id;
    } else if (proposal.blocks.product.action === "update" && proposal.blocks.product.id) {
      await updateProduct(proposal.blocks.product.id, {
        name: proposal.blocks.product.name,
        sku: proposal.blocks.product.sku,
        description: proposal.blocks.product.description,
        basePrice: proposal.blocks.product.basePrice,
      });
      saved.push("product");
    }
  }

  // Segment
  if (proposal.blocks.segment?.enabled) {
    if (proposal.blocks.segment.action === "create") {
      const created = await createSegment({
        name: proposal.blocks.segment.name,
        description: proposal.blocks.segment.description,
      });
      saved.push("segment");
      createdIds["segment"] = created.id;
    } else if (proposal.blocks.segment.action === "update" && proposal.blocks.segment.id) {
      await updateSegment(proposal.blocks.segment.id, {
        name: proposal.blocks.segment.name,
        description: proposal.blocks.segment.description,
      });
      saved.push("segment");
    }
  }

  // Visit update (only updates, not create — creation is handled by interaction block)
  if (proposal.blocks.visit?.enabled && proposal.blocks.visit.action === "update" && proposal.blocks.visit.id) {
    await updateVisit(proposal.blocks.visit.id, {
      scheduledAt: proposal.blocks.visit.scheduledAt,
      summary: proposal.blocks.visit.summary,
      notes: proposal.blocks.visit.notes,
    });
    saved.push("visit");
  }

  // FollowUp update (for modify actions where we update instead of create)
  if (proposal.blocks.followUp?.enabled && proposal.blocks.followUp.action === "update" && proposal.blocks.followUp.id) {
    await updateFollowup(proposal.blocks.followUp.id, {
      dueAt: proposal.blocks.followUp.dueAt,
      title: proposal.blocks.followUp.title,
      notes: proposal.blocks.followUp.notes,
    });
    saved.push("followup");
  }

  const message = `Laura guardó ${saved.length} bloques${discarded.length > 0 ? ` y descartó ${discarded.length}` : ""}.`;

  return { saved, discarded, createdIds, message };
}