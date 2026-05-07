import { describe, expect, it } from "vitest";
import { getCapability, listCapabilities } from "../platform/capabilities.js";

describe("platform capabilities", () => {
  it("lists read and write capabilities for core CRM modules", () => {
    const capabilities = listCapabilities();

    expect(capabilities.some((cap) => cap.domain === "customers" && cap.action === "search" && cap.kind === "read")).toBe(true);
    expect(capabilities.some((cap) => cap.domain === "quotes" && cap.action === "create" && cap.kind === "write")).toBe(true);
    expect(capabilities.some((cap) => cap.domain === "followups" && cap.action === "create" && cap.requiresConfirmation)).toBe(true);
  });

  it("returns required fields for quote creation", () => {
    const capability = getCapability("quotes", "create");

    expect(capability?.requiredFields).toEqual(["customerId"]);
    expect(capability?.requiresConfirmation).toBe(true);
    expect(capability?.toolName).toBe("create_quote");
  });

  it("does not let callers mutate registry field arrays", () => {
    const capability = getCapability("quotes", "create");

    capability?.requiredFields?.push("corrupted");

    expect(getCapability("quotes", "create")?.requiredFields).toEqual(["customerId"]);
  });

  it("returns undefined for unsupported actions", () => {
    expect(getCapability("orders", "bulk_delete")).toBeUndefined();
  });
});
