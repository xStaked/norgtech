import type { LauraState } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
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
  createVisit,
  updateVisit,
  updateFollowup,
} from "../../tools/nestjs-client.js";

export async function confirmNode(state: LauraState): Promise<Partial<LauraState>> {
  if (!state.proposal) {
    return {
      mode: "proposal",
      lastError: "No hay propuesta para confirmar",
      messages: [...state.messages, new AIMessage("No hay propuesta para confirmar.")],
    };
  }

  const blocks = state.proposal.blocks;
  const customerId = state.customerContext?.id;
  const saved: string[] = [];
  const discarded: string[] = [];

  let opportunityId = blocks.opportunity?.opportunityId
    ?? state.opportunityContext?.id;

  if (blocks.opportunity?.enabled && customerId) {
    if (blocks.opportunity.createNew) {
      const created = await upsertOpportunity({
        customerId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage ?? "contacto",
      });
      opportunityId = created.id;
      saved.push("opportunity");
    } else if (blocks.opportunity.opportunityId && blocks.opportunity.stage) {
      const updated = await upsertOpportunity({
        customerId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage,
        opportunityId: blocks.opportunity.opportunityId,
      });
      opportunityId = updated.id;
      saved.push("opportunity");
    } else {
      discarded.push("opportunity");
    }
  }

  if (blocks.interaction?.enabled && customerId) {
    await createInteraction({
      customerId,
      summary: blocks.interaction.summary,
      rawMessage: blocks.interaction.rawMessage,
      opportunityId,
    });
    saved.push("interaction");
  }

  if (blocks.followUp?.enabled && customerId) {
    await createFollowUp({
      customerId,
      title: blocks.followUp.title!,
      dueAt: blocks.followUp.dueAt!,
      type: blocks.followUp.type!,
      opportunityId,
    });
    saved.push("followUp");
  }

  if (blocks.task?.enabled && customerId) {
    await createTask({
      customerId,
      title: blocks.task.title,
      dueAt: blocks.task.dueAt,
      opportunityId: opportunityId,
      notes: blocks.task.notes,
    });
    saved.push("task");
  }

  // Customer
  if (blocks.customer?.enabled) {
    if (blocks.customer.action === "create") {
      await createCustomer({
        legalName: blocks.customer.legalName,
        displayName: blocks.customer.displayName,
        taxId: blocks.customer.taxId,
        phone: blocks.customer.phone,
        email: blocks.customer.email,
        address: blocks.customer.address,
        city: blocks.customer.city,
        department: blocks.customer.department,
        notes: blocks.customer.notes,
        segmentId: blocks.customer.segmentId,
        assignedToUserId: blocks.customer.assignedToUserId,
      });
      saved.push("customer");
    } else if (blocks.customer.action === "update" && blocks.customer.id) {
      await updateCustomer(blocks.customer.id, {
        legalName: blocks.customer.legalName,
        displayName: blocks.customer.displayName,
        phone: blocks.customer.phone,
        email: blocks.customer.email,
        address: blocks.customer.address,
        notes: blocks.customer.notes,
      });
      saved.push("customer");
    }
  }

  // Contact
  if (blocks.contact?.enabled) {
    if (blocks.contact.action === "create") {
      await createContact({
        customerId: blocks.contact.customerId,
        fullName: blocks.contact.fullName,
        roleTitle: blocks.contact.roleTitle,
        phone: blocks.contact.phone,
        email: blocks.contact.email,
        isPrimary: blocks.contact.isPrimary,
        notes: blocks.contact.notes,
      });
      saved.push("contact");
    } else if (blocks.contact.action === "update" && blocks.contact.id) {
      await updateContact(blocks.contact.id, {
        fullName: blocks.contact.fullName,
        roleTitle: blocks.contact.roleTitle,
        phone: blocks.contact.phone,
        email: blocks.contact.email,
        notes: blocks.contact.notes,
      });
      saved.push("contact");
    }
  }

  // Quote
  if (blocks.quote?.enabled) {
    if (blocks.quote.action === "create") {
      await createQuote({
        customerId: blocks.quote.customerId,
        opportunityId: blocks.quote.opportunityId,
        validUntil: blocks.quote.validUntil,
        notes: blocks.quote.notes,
        items: blocks.quote.items ?? [],
      });
      saved.push("quote");
    } else if (blocks.quote.action === "update" && blocks.quote.id) {
      await updateQuoteStatus(blocks.quote.id, { status: "abierta" });
      saved.push("quote");
    }
  }

  // Order
  if (blocks.order?.enabled) {
    if (blocks.order.action === "create") {
      await createOrder({
        customerId: blocks.order.customerId,
        opportunityId: blocks.order.opportunityId,
        sourceQuoteId: blocks.order.sourceQuoteId,
        notes: blocks.order.notes,
        items: blocks.order.items ?? [],
      });
      saved.push("order");
    } else if (blocks.order.action === "update" && blocks.order.id) {
      await updateOrderStatus(blocks.order.id, { status: "recibido" });
      saved.push("order");
    }
  }

  // Product
  if (blocks.product?.enabled) {
    if (blocks.product.action === "create") {
      await createProduct({
        sku: blocks.product.sku,
        name: blocks.product.name,
        description: blocks.product.description,
        unit: blocks.product.unit,
        presentation: blocks.product.presentation,
        basePrice: blocks.product.basePrice,
      });
      saved.push("product");
    } else if (blocks.product.action === "update" && blocks.product.id) {
      await updateProduct(blocks.product.id, {
        name: blocks.product.name,
        sku: blocks.product.sku,
        description: blocks.product.description,
        basePrice: blocks.product.basePrice,
      });
      saved.push("product");
    }
  }

  // Segment
  if (blocks.segment?.enabled) {
    if (blocks.segment.action === "create") {
      await createSegment({
        name: blocks.segment.name,
        description: blocks.segment.description,
      });
      saved.push("segment");
    } else if (blocks.segment.action === "update" && blocks.segment.id) {
      await updateSegment(blocks.segment.id, {
        name: blocks.segment.name,
        description: blocks.segment.description,
      });
      saved.push("segment");
    }
  }

  if (blocks.visit?.enabled) {
    if (blocks.visit.action === "create" && customerId && blocks.visit.scheduledAt) {
      await createVisit({
        customerId,
        opportunityId,
        scheduledAt: blocks.visit.scheduledAt,
        summary: blocks.visit.summary,
        notes: blocks.visit.notes,
      });
      saved.push("visit");
    } else if (blocks.visit.action === "update" && blocks.visit.id) {
      await updateVisit(blocks.visit.id, {
        scheduledAt: blocks.visit.scheduledAt,
        summary: blocks.visit.summary,
        notes: blocks.visit.notes,
      });
      saved.push("visit");
    }
  }

  // FollowUp update (for modify actions where we update instead of create)
  if (blocks.followUp?.enabled && blocks.followUp.action === "update" && blocks.followUp.id) {
    await updateFollowup(blocks.followUp.id, {
      dueAt: blocks.followUp.dueAt,
      title: blocks.followUp.title,
      notes: blocks.followUp.notes,
    });
    saved.push("followup");
  }

  const summary = `Laura guardó ${saved.length} bloques${discarded.length > 0 ? ` y descartó ${discarded.length}` : ""}.`;

  return {
    proposalStatus: "confirmed",
    messages: [...state.messages, new AIMessage(summary)],
  };
}
