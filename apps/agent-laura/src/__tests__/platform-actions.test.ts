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
