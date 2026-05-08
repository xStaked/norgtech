import { describe, expect, it } from "vitest";
import { getCapability, listCapabilities } from "../platform/capabilities.js";
import { validatePlatformPlan } from "../platform/validator.js";

describe("platform capabilities", () => {
  it("lists read and write capabilities for core CRM modules", () => {
    const capabilities = listCapabilities();

    expect(capabilities.some((cap) => cap.domain === "customers" && cap.action === "search" && cap.kind === "read")).toBe(true);
    expect(capabilities.some((cap) => cap.domain === "opportunities" && cap.action === "create" && cap.kind === "write")).toBe(true);
    expect(capabilities.some((cap) => cap.domain === "quotes" && cap.action === "create" && cap.kind === "write")).toBe(true);
    expect(capabilities.some((cap) => cap.domain === "followups" && cap.action === "create" && cap.requiresConfirmation)).toBe(true);
  });

  it("returns required fields for quote creation", () => {
    const capability = getCapability("quotes", "create");

    expect(capability?.requiredFields).toEqual(["customerId", "items", "pricing", "conditions", "status"]);
    expect(capability?.requiresConfirmation).toBe(true);
    expect(capability?.toolName).toBe("create_quote");
  });

  it("returns required fields for visit creation", () => {
    const capability = getCapability("visits", "create");

    expect(capability?.requiredFields).toEqual(["customerId", "scheduledAt"]);
    expect(capability?.requiresConfirmation).toBe(true);
    expect(capability?.toolName).toBe("create_visit");
  });

  it("adds cancel capabilities for quotes and orders with confirmation", () => {
    expect(getCapability("quotes", "cancel")).toMatchObject({
      toolName: "update_quote",
      requiredFields: ["quoteId"],
      requiresConfirmation: true,
    });
    expect(getCapability("orders", "cancel")).toMatchObject({
      toolName: "update_order",
      requiredFields: ["orderId"],
      requiresConfirmation: true,
    });
  });

  it("keeps new commercial write capabilities available", () => {
    expect(getCapability("opportunities", "create")).toMatchObject({
      toolName: "create_opportunity",
      requiresConfirmation: true,
    });
    expect(getCapability("visits", "create")).toMatchObject({
      toolName: "create_visit",
      requiresConfirmation: true,
    });
  });

  it("does not let callers mutate registry field arrays", () => {
    const capability = getCapability("quotes", "create");

    capability?.requiredFields?.push("corrupted");

    expect(getCapability("quotes", "create")?.requiredFields).toEqual(["customerId", "items", "pricing", "conditions", "status"]);
  });

  it("returns undefined for unsupported actions", () => {
    expect(getCapability("orders", "bulk_delete")).toBeUndefined();
  });

  it("asks for clarification when a write plan is ambiguous", () => {
    const result = validatePlatformPlan({
      intent: "write",
      summary: "Actualizar visita",
      actions: [
        {
          domain: "visits",
          action: "update",
          toolName: "update_visit",
          arguments: {},
          requiredFields: ["visitId"],
          missingFields: [],
          requiresConfirmation: true,
          confidence: 0.92,
        },
      ],
      requiresConfirmation: true,
      ambiguity: ["multiple_visits"],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("ambiguous_reference");
    expect(result.clarificationQuestion?.toLowerCase()).toContain("visita");
  });

  it("only advertises update fields that the current write pipeline actually supports", () => {
    expect(getCapability("quotes", "update")?.optionalFields).toEqual(["status"]);
    expect(getCapability("orders", "update")?.optionalFields).toEqual(["status"]);
    expect(getCapability("followups", "update")?.optionalFields).toEqual(["title", "dueAt", "notes"]);
    expect(getCapability("quotes", "update")?.optionalFields).not.toEqual(
      expect.arrayContaining(["pricing", "conditions", "notes", "items"]),
    );
    expect(getCapability("orders", "update")?.optionalFields).not.toEqual(
      expect.arrayContaining(["pricing", "conditions", "notes", "items"]),
    );
    expect(getCapability("followups", "update")?.optionalFields).not.toEqual(
      expect.arrayContaining(["owner", "status", "note", "type", "customerId"]),
    );
  });

  it("asks for stronger commercial detail before validating quote proposals", () => {
    const result = validatePlatformPlan({
      intent: "write",
      summary: "Crear cotizacion",
      actions: [
        {
          domain: "quotes",
          action: "create",
          toolName: "create_quote",
          arguments: {
            customerId: "customer-1",
            items: [{ productId: "product-1", quantity: 1, unitPrice: 1500 }],
          },
          requiredFields: ["customerId", "items", "pricing", "conditions", "status"],
          missingFields: [],
          requiresConfirmation: true,
          confidence: 0.95,
        },
      ],
      requiresConfirmation: true,
    });

    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual(["pricing", "conditions", "status"]);
    expect(result.errors).toContain("missing_commercial_fields");
    expect(result.clarificationQuestion).toContain("precios");
    expect(result.clarificationQuestion).toContain("condiciones");
    expect(result.clarificationQuestion).toContain("estado");
    expect(result.clarificationQuestion).not.toContain("cliente");
    expect(result.clarificationQuestion).not.toContain("items");
  });

  it("rejects commercially incomplete quote lines without quantity or unit price", () => {
    const result = validatePlatformPlan({
      intent: "write",
      summary: "Crear cotizacion incompleta",
      actions: [
        {
          domain: "quotes",
          action: "create",
          toolName: "create_quote",
          arguments: {
            customerId: "customer-1",
            items: [{ productId: "product-1", quantity: 1 }, { productId: "product-2", unitPrice: 900 }],
            pricing: { currency: "COP" },
            conditions: "Pago 50/50",
            status: "draft",
          },
          requiredFields: ["customerId", "items", "pricing", "conditions", "status"],
          missingFields: [],
          requiresConfirmation: true,
          confidence: 0.95,
        },
      ],
      requiresConfirmation: true,
    });

    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual(["items", "pricing"]);
    expect(result.errors).toContain("missing_commercial_fields");
    expect(result.clarificationQuestion).toContain("items");
    expect(result.clarificationQuestion).toContain("precios");
  });

  it("keeps supported follow-up updates valid for the current proposal/write contract", () => {
    const result = validatePlatformPlan({
      intent: "write",
      summary: "Reprogramar seguimiento",
      actions: [
        {
          domain: "followups",
          action: "update",
          toolName: "update_followup",
          arguments: {
            followupId: "followup-1",
            title: "Llamar de nuevo",
            dueAt: "2026-05-10T10:00:00.000Z",
            notes: "Mover para la proxima semana",
          },
          requiredFields: ["followupId"],
          missingFields: [],
          requiresConfirmation: true,
          confidence: 0.94,
        },
      ],
      requiresConfirmation: true,
    });

    expect(result.ok).toBe(true);
    expect(result.executableReads).toEqual([]);
    expect(result.proposalWrites).toHaveLength(1);
    expect(result.proposalWrites[0]).toMatchObject({
      domain: "followups",
      action: "update",
      requiresConfirmation: true,
      requiredFields: ["followupId"],
      missingFields: [],
    });
  });
});
