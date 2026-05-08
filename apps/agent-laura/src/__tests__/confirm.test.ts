import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalPayload } from "../types.js";

const {
  mockCreateInteraction,
  mockCreateFollowUp,
  mockCreateTask,
  mockUpsertOpportunity,
  mockCreateCustomer,
  mockUpdateCustomer,
  mockCreateContact,
  mockUpdateContact,
  mockCreateQuote,
  mockUpdateQuoteStatus,
  mockCreateOrder,
  mockUpdateOrderStatus,
  mockCreateProduct,
  mockUpdateProduct,
  mockCreateSegment,
  mockUpdateSegment,
  mockUpdateVisit,
  mockUpdateFollowup,
} = vi.hoisted(() => ({
  mockCreateInteraction: vi.fn(),
  mockCreateFollowUp: vi.fn(),
  mockCreateTask: vi.fn(),
  mockUpsertOpportunity: vi.fn(),
  mockCreateCustomer: vi.fn(),
  mockUpdateCustomer: vi.fn(),
  mockCreateContact: vi.fn(),
  mockUpdateContact: vi.fn(),
  mockCreateQuote: vi.fn(),
  mockUpdateQuoteStatus: vi.fn(),
  mockCreateOrder: vi.fn(),
  mockUpdateOrderStatus: vi.fn(),
  mockCreateProduct: vi.fn(),
  mockUpdateProduct: vi.fn(),
  mockCreateSegment: vi.fn(),
  mockUpdateSegment: vi.fn(),
  mockUpdateVisit: vi.fn(),
  mockUpdateFollowup: vi.fn(),
}));

vi.mock("../tools/nestjs-client.js", () => ({
  createInteraction: mockCreateInteraction,
  createFollowUp: mockCreateFollowUp,
  createTask: mockCreateTask,
  upsertOpportunity: mockUpsertOpportunity,
  createCustomer: mockCreateCustomer,
  updateCustomer: mockUpdateCustomer,
  createContact: mockCreateContact,
  updateContact: mockUpdateContact,
  createQuote: mockCreateQuote,
  updateQuoteStatus: mockUpdateQuoteStatus,
  createOrder: mockCreateOrder,
  updateOrderStatus: mockUpdateOrderStatus,
  createProduct: mockCreateProduct,
  updateProduct: mockUpdateProduct,
  createSegment: mockCreateSegment,
  updateSegment: mockUpdateSegment,
  updateVisit: mockUpdateVisit,
  updateFollowup: mockUpdateFollowup,
}));

import { handleConfirm } from "../confirm.js";

describe("handleConfirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateFollowUp.mockResolvedValue({ id: "followup-1" });
    mockUpdateVisit.mockResolvedValue({ id: "visit-1" });
    mockUpdateFollowup.mockResolvedValue({ id: "followup-1" });
  });

  it("uses customerId from a follow-up block when no external customerId is passed", async () => {
    const proposal = {
      blocks: {
        followUp: {
          enabled: true,
          action: "create",
          customerId: "customer-1",
          title: "Llamar a Acme",
          dueAt: "2026-05-14T10:00:00.000Z",
          type: "llamada",
        },
      },
    } as ProposalPayload;

    const result = await handleConfirm(proposal, undefined, undefined);

    expect(mockCreateFollowUp).toHaveBeenCalledWith({
      customerId: "customer-1",
      title: "Llamar a Acme",
      dueAt: "2026-05-14T10:00:00.000Z",
      type: "llamada",
      opportunityId: undefined,
    });
    expect(result.saved).toEqual(["followUp"]);
    expect(result.errors).toEqual([]);
  });

  it("reports partial success when a related action fails after the primary action succeeds", async () => {
    mockUpdateFollowup.mockRejectedValueOnce(new Error("follow-up update failed"));

    const proposal = {
      blocks: {
        visit: {
          enabled: true,
          action: "update",
          id: "visit-1",
          scheduledAt: "2026-05-15T10:00:00.000Z",
        },
        followUp: {
          enabled: true,
          action: "update",
          id: "followup-1",
          dueAt: "2026-05-15T16:00:00.000Z",
          relatedTo: "visit-1",
        },
      },
    } as ProposalPayload;

    const result = await handleConfirm(proposal, undefined, undefined);

    expect(mockUpdateVisit).toHaveBeenCalledWith("visit-1", {
      scheduledAt: "2026-05-15T10:00:00.000Z",
      summary: undefined,
      notes: undefined,
    });
    expect(mockUpdateFollowup).toHaveBeenCalledWith("followup-1", {
      dueAt: "2026-05-15T16:00:00.000Z",
      title: undefined,
      notes: undefined,
    });
    expect(result.saved).toEqual(["visit"]);
    expect(result.discarded).toEqual([]);
    expect(result.errors).toEqual([
      { block: "followUp", message: "follow-up update failed" },
    ]);
  });

  it("discards a related action when its prerequisite primary action did not save", async () => {
    mockUpdateVisit.mockRejectedValueOnce(new Error("visit update failed"));

    const proposal = {
      blocks: {
        visit: {
          enabled: true,
          action: "update",
          id: "visit-1",
          scheduledAt: "2026-05-15T10:00:00.000Z",
        },
        followUp: {
          enabled: true,
          action: "update",
          id: "followup-1",
          dueAt: "2026-05-15T16:00:00.000Z",
          relatedTo: "visit-1",
        },
      },
    } as ProposalPayload;

    const result = await handleConfirm(proposal, undefined, undefined);

    expect(mockUpdateVisit).toHaveBeenCalledTimes(1);
    expect(mockUpdateFollowup).not.toHaveBeenCalled();
    expect(result.saved).toEqual([]);
    expect(result.discarded).toEqual(["followUp"]);
    expect(result.errors).toEqual([
      { block: "visit", message: "visit update failed" },
    ]);
  });
});
