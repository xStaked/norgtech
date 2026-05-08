import { HumanMessage } from "@langchain/core/messages";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LauraState } from "../graph/state.js";
import type { ProposalPayload, ProposalSummary } from "../types.js";
import type { PlannedAction } from "../platform/types.js";

const {
  searchCustomers,
  getCustomerDetails,
  searchOpportunities,
  getOpportunityDetails,
  searchProducts,
  getProductDetails,
  searchQuotes,
  getQuoteDetails,
  searchOrders,
  getOrderDetails,
  searchSegments,
  searchContacts,
  searchVisits,
  searchFollowups,
  getDashboardSummary,
  createVisit,
} = vi.hoisted(() => ({
  searchCustomers: vi.fn(),
  getCustomerDetails: vi.fn(),
  searchOpportunities: vi.fn(),
  getOpportunityDetails: vi.fn(),
  searchProducts: vi.fn(),
  getProductDetails: vi.fn(),
  searchQuotes: vi.fn(),
  getQuoteDetails: vi.fn(),
  searchOrders: vi.fn(),
  getOrderDetails: vi.fn(),
  searchSegments: vi.fn(),
  searchContacts: vi.fn(),
  searchVisits: vi.fn(),
  searchFollowups: vi.fn(),
  getDashboardSummary: vi.fn(),
  createVisit: vi.fn(),
}));

vi.mock("../tools/nestjs-client.js", () => ({
  searchCustomers,
  getCustomerDetails,
  searchOpportunities,
  getOpportunityDetails,
  searchProducts,
  getProductDetails,
  searchQuotes,
  getQuoteDetails,
  searchOrders,
  getOrderDetails,
  searchSegments,
  searchContacts,
  searchVisits,
  searchFollowups,
  getDashboardSummary,
  createVisit,
}));

import { buildProposalFromActions } from "../platform/proposal-builder.js";
import { buildPlatformContext } from "../platform/context.js";
import { executeReadActions } from "../platform/read-executor.js";

function makeAction(overrides: Partial<PlannedAction>): PlannedAction {
  return {
    domain: "quotes",
    action: "search",
    toolName: "search_quotes",
    arguments: {},
    requiredFields: [],
    missingFields: [],
    requiresConfirmation: false,
    ...overrides,
  };
}

function makeState(overrides: Partial<LauraState> = {}): LauraState {
  return {
    sessionId: "session-1",
    userId: "user-1",
    messages: [new HumanMessage("test")],
    mode: "proposal",
    customerContext: null,
    opportunityContext: null,
    clarificationOptions: null,
    proposal: null,
    proposalId: null,
    proposalStatus: "draft",
    agendaItems: null,
    lastError: null,
    _extractionResult: null,
    mentionedEntities: {},
    data: null,
    ...overrides,
  };
}

describe("platform actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildProposalFromActions maps quote and follow-up writes into proposal blocks", () => {
    const quoteItems = [
      { productId: "product-1", quantity: 2, unitPrice: 1500, notes: "Tanque A" },
    ];
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "quotes",
        action: "create",
        toolName: "create_quote",
        arguments: {
          customerId: "customer-1",
          notes: "Cotizacion para sistema piloto",
          items: quoteItems,
        },
        requiredFields: ["customerId"],
        requiresConfirmation: true,
      }),
      makeAction({
        domain: "followups",
        action: "create",
        toolName: "create_followup",
        arguments: {
          customerId: "customer-1",
          title: "Llamar para revisar cotizacion",
          dueAt: "2026-05-12T15:00:00.000Z",
          type: "llamada",
        },
        requiredFields: ["customerId", "title", "dueAt", "type"],
        requiresConfirmation: true,
      }),
      makeAction({
        domain: "quotes",
        action: "search",
        toolName: "search_quotes",
        arguments: { customerId: "customer-1" },
      }),
    ]);

    expect(proposal.blocks.quote).toMatchObject({
      enabled: true,
      action: "create",
      customerId: "customer-1",
      notes: "Cotizacion para sistema piloto",
      items: quoteItems,
    });
    expect(proposal.blocks.followUp).toMatchObject({
      enabled: true,
      action: "create",
      title: "Llamar para revisar cotizacion",
      dueAt: "2026-05-12T15:00:00.000Z",
      type: "llamada",
    });
    expect(Object.keys(proposal.blocks)).toEqual(["quote", "followUp"]);
  });

  it("executeReadActions searches quotes with customer and status filters", async () => {
    searchQuotes.mockResolvedValueOnce([{ id: "quote-1", status: "pendiente" }]);

    const result = await executeReadActions("user-1", [
      makeAction({
        domain: "quotes",
        action: "search",
        toolName: "search_quotes",
        arguments: { customerId: "customer-1", status: "pendiente" },
      }),
    ]);

    expect(searchQuotes).toHaveBeenCalledWith({ customerId: "customer-1", status: "pendiente" });
    expect(result).toEqual({
      entityType: "quotes",
      action: "list",
      data: [{ id: "quote-1", status: "pendiente" }],
      summary: expect.stringContaining("1 resultado"),
    });
  });

  it("buildProposalFromActions enables customer updates with only the changed fields", () => {
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "customers",
        action: "update",
        toolName: "update_customer",
        arguments: { customerId: "customer-1", phone: "+57 300 123 4567" },
        requiredFields: ["customerId"],
        requiresConfirmation: true,
      }),
    ]);

    expect(proposal.blocks.customer).toMatchObject({
      enabled: true,
      action: "update",
      id: "customer-1",
      phone: "+57 300 123 4567",
    });
    expect(proposal.blocks.customer?.legalName).toBeUndefined();
  });

  it("buildProposalFromActions enables follow-up reschedules without requiring title or type overwrites", () => {
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "followups",
        action: "update",
        toolName: "update_followup",
        arguments: { followupId: "followup-1", dueAt: "2026-05-14T10:00:00.000Z" },
        requiredFields: ["followupId"],
        requiresConfirmation: true,
      }),
    ]);

    expect(proposal.blocks.followUp).toMatchObject({
      enabled: true,
      action: "update",
      id: "followup-1",
      dueAt: "2026-05-14T10:00:00.000Z",
    });
    expect(proposal.blocks.followUp?.title).toBeUndefined();
    expect(proposal.blocks.followUp?.type).toBeUndefined();
  });

  it("buildProposalFromActions keeps related impact metadata for visit reschedules with follow-up moves", () => {
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "visits",
        action: "update",
        toolName: "update_visit",
        arguments: {
          visitId: "visit-1",
          scheduledAt: "2026-05-14T13:00:00.000Z",
          summary: "Visita reprogramada",
        },
        requiredFields: ["visitId"],
        requiresConfirmation: true,
        role: "primary",
        humanSummary: "Reprogramar visita",
      }),
      makeAction({
        domain: "followups",
        action: "update",
        toolName: "update_followup",
        arguments: {
          followupId: "followup-1",
          dueAt: "2026-05-14T17:00:00.000Z",
          notes: "Mover por cambio de visita",
        },
        requiredFields: ["followupId"],
        requiresConfirmation: true,
        role: "related",
        relatedTo: "visit-1",
        humanSummary: "Mover seguimiento relacionado",
      }),
    ]);

    expect(proposal.blocks.visit).toMatchObject({
      enabled: true,
      action: "update",
      id: "visit-1",
      scheduledAt: "2026-05-14T13:00:00.000Z",
    });
    expect(proposal.blocks.followUp).toMatchObject({
      enabled: true,
      action: "update",
      id: "followup-1",
      dueAt: "2026-05-14T17:00:00.000Z",
    });
    expect(proposal.summary).toMatchObject({
      primaryCount: 1,
      relatedCount: 1,
      primaryActions: ["visits.update"],
      relatedActions: ["followups.update"],
      relatedToIds: ["visit-1"],
      labels: ["Reprogramar visita", "Mover seguimiento relacionado"],
    });
  });

  it("buildProposalFromActions falls back to action:domain labels when humanSummary is missing", () => {
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "orders",
        action: "cancel",
        toolName: "update_order",
        arguments: {
          orderId: "order-1",
          status: "cancelled",
        },
        requiredFields: ["orderId"],
        requiresConfirmation: true,
      }),
    ]);

    expect(proposal.summary?.labels).toEqual(["cancel:orders"]);
  });

  it("buildProposalFromActions excludes disabled writes from summary metadata", () => {
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "visits",
        action: "update",
        toolName: "update_visit",
        arguments: {
          visitId: "visit-1",
          scheduledAt: "2026-05-14T13:00:00.000Z",
        },
        requiredFields: ["visitId"],
        requiresConfirmation: true,
        role: "primary",
        humanSummary: "Reprogramar visita",
      }),
      makeAction({
        domain: "quotes",
        action: "create",
        toolName: "create_quote",
        arguments: {
          customerId: "customer-1",
          items: ["malformed"],
        },
        requiredFields: ["customerId"],
        requiresConfirmation: true,
        role: "related",
        relatedTo: "visit-1",
        humanSummary: "Crear cotizacion derivada",
      }),
    ]);

    expect(proposal.blocks.visit?.enabled).toBe(true);
    expect(proposal.blocks.quote?.enabled).toBe(false);
    expect(proposal.summary).toMatchObject({
      primaryCount: 1,
      relatedCount: 0,
      primaryActions: ["visits.update"],
      relatedActions: [],
      relatedToIds: [],
      labels: ["Reprogramar visita"],
    });
  });

  it("buildProposalFromActions preserves customer context on follow-up creates", () => {
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "followups",
        action: "create",
        toolName: "create_followup",
        arguments: {
          customerId: "customer-1",
          title: "Llamar a Acme",
          dueAt: "2026-05-14T10:00:00.000Z",
          type: "llamada",
        },
        requiredFields: ["customerId", "title", "dueAt", "type"],
        requiresConfirmation: true,
      }),
    ]);

    expect(proposal.blocks.followUp).toMatchObject({
      enabled: true,
      action: "create",
      customerId: "customer-1",
      title: "Llamar a Acme",
    });
  });

  it("buildProposalFromActions maps visit creates into a visit proposal block", () => {
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "visits",
        action: "create",
        toolName: "create_visit",
        arguments: {
          customerId: "customer-1",
          scheduledAt: "2026-05-14T13:00:00.000Z",
          summary: "Visita comercial",
        },
        requiredFields: ["customerId", "scheduledAt"],
        requiresConfirmation: true,
      }),
    ]);

    expect(proposal.blocks.visit).toMatchObject({
      enabled: true,
      action: "create",
      customerId: "customer-1",
      scheduledAt: "2026-05-14T13:00:00.000Z",
      summary: "Visita comercial",
    });
  });

  it("buildPlatformContext carries active proposal summary metadata for nearby impact detection", () => {
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "visits",
        action: "update",
        toolName: "update_visit",
        arguments: {
          visitId: "visit-1",
          scheduledAt: "2026-05-14T13:00:00.000Z",
        },
        requiredFields: ["visitId"],
        requiresConfirmation: true,
        role: "primary",
      }),
      makeAction({
        domain: "followups",
        action: "update",
        toolName: "update_followup",
        arguments: {
          followupId: "followup-1",
          dueAt: "2026-05-14T17:00:00.000Z",
        },
        requiredFields: ["followupId"],
        requiresConfirmation: true,
        role: "related",
        relatedTo: "visit-1",
      }),
    ]);

    const context = buildPlatformContext(makeState({
      proposal,
      proposalStatus: "draft",
      messages: [new HumanMessage("movelo tambien")],
      mentionedEntities: {
        followupId: "followup-2",
        quoteId: "quote-9",
        orderId: "order-7",
        visitId: "visit-2",
      },
      agendaItems: [
        { id: "followup-3", type: "follow_up_task", label: "Llamar a Acme" },
        { id: "visit-3", type: "visit", label: "Visita Acme", scheduledAt: "2026-05-20T10:00:00.000Z" },
      ],
    }));

    expect(context.activeProposal).toEqual(proposal);
    expect(context.activeProposalSummary).toMatchObject({
      primaryCount: 1,
      relatedCount: 1,
      labels: ["update:visits", "update:followups"],
    });
    expect(context.relatedEntities).toMatchObject({
      openFollowUpIds: expect.arrayContaining(["followup-1", "followup-2", "followup-3"]),
      openQuoteIds: ["quote-9"],
      openOrderIds: ["order-7"],
      upcomingVisitIds: expect.arrayContaining(["visit-1", "visit-2", "visit-3"]),
    });
  });

  it("buildPlatformContext keeps relationship-only relatedTo ids in relatedEntities", () => {
    const proposal: ProposalPayload = {
      blocks: {},
      summary: {
        primaryCount: 0,
        relatedCount: 1,
        primaryActions: [],
        relatedActions: ["followups.update"],
        relatedToIds: ["visit-9", "quote-4", "order-3", "followup-7"],
        labels: ["Mover seguimiento"],
      } satisfies ProposalSummary,
    };

    const context = buildPlatformContext(makeState({
      proposal,
      proposalStatus: "draft",
    }));

    expect(context.relatedEntities).toMatchObject({
      openFollowUpIds: ["followup-7"],
      openQuoteIds: ["quote-4"],
      openOrderIds: ["order-3"],
      upcomingVisitIds: ["visit-9"],
    });
  });

  it("buildProposalFromActions disables malformed quote items instead of creating enabled malformed items", () => {
    const proposal = buildProposalFromActions([
      makeAction({
        domain: "quotes",
        action: "create",
        toolName: "create_quote",
        arguments: {
          customerId: "customer-1",
          items: ["x"],
        },
        requiredFields: ["customerId"],
        requiresConfirmation: true,
      }),
    ]);

    expect(proposal.blocks.quote).toMatchObject({
      enabled: false,
      action: "create",
      customerId: "customer-1",
    });
    expect(proposal.blocks.quote?.items).toBeUndefined();
  });

  it("executeReadActions preserves all results for multiple read actions", async () => {
    getCustomerDetails.mockResolvedValueOnce({ id: "customer-1", displayName: "Acme" });
    searchQuotes.mockResolvedValueOnce([{ id: "quote-1" }]);

    const result = await executeReadActions("user-1", [
      makeAction({
        domain: "customers",
        action: "detail",
        toolName: "get_customer_details",
        arguments: { customerId: "customer-1" },
        requiredFields: ["customerId"],
      }),
      makeAction({
        domain: "quotes",
        action: "search",
        toolName: "search_quotes",
        arguments: { customerId: "customer-1" },
      }),
    ]);

    expect(result.entityType).toBe("multiple");
    expect(result.action).toBe("list");
    expect(result.summary).toContain("2 acciones");
    expect(result.data).toEqual([
      { action: "customers.detail", data: { id: "customer-1", displayName: "Acme" } },
      { action: "quotes.search", data: [{ id: "quote-1" }] },
    ]);
  });

  it("executeReadActions returns an error payload for unsupported reads", async () => {
    const result = await executeReadActions("user-1", [
      makeAction({
        domain: "reports",
        action: "search",
        toolName: "search_reports",
        arguments: { status: "active" },
      }),
    ]);

    expect(result.entityType).toBe("reports");
    expect(result.action).toBe("detail");
    expect(result.data).toMatchObject({
      error: true,
      code: "UNSUPPORTED_READ_ACTION",
      domain: "reports",
      action: "search",
    });
  });
});
