import { describe, expect, it, vi, beforeEach } from "vitest";
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
}));

import { buildProposalFromActions } from "../platform/proposal-builder.js";
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

  it("buildProposalFromActions does not enable customer updates with empty legalName overwrites", () => {
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
      enabled: false,
      action: "update",
      id: "customer-1",
      phone: "+57 300 123 4567",
    });
    expect(proposal.blocks.customer?.legalName).toBeUndefined();
  });

  it("buildProposalFromActions does not enable follow-up updates with empty title or type overwrites", () => {
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
      enabled: false,
      action: "update",
      id: "followup-1",
      dueAt: "2026-05-14T10:00:00.000Z",
    });
    expect(proposal.blocks.followUp?.title).toBeUndefined();
    expect(proposal.blocks.followUp?.type).toBeUndefined();
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
