import { describe, expect, it } from "vitest";
import { appName } from "./index";

describe("shared workspace package", () => {
  it("exports the app name constant", () => {
    expect(appName).toBe("norgtech-crm");
  });
});
