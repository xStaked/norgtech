// node --test src/components/users/user-mutations.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmailInput, isValidEmailInput, emailConflictMessage } from "./user-mutations.ts";

test("normaliza trim + minusculas", () => {
  assert.equal(normalizeEmailInput("  NUEVO@Norgtech.COM "), "nuevo@norgtech.com");
});
test("rechaza vacio y sin forma de correo", () => {
  assert.equal(isValidEmailInput(""), false);
  assert.equal(isValidEmailInput("sin-arroba"), false);
  assert.equal(isValidEmailInput("a@b"), false);
  assert.equal(isValidEmailInput("a@b.com"), true);
});
test("traduce el 409 de email duplicado", () => {
  assert.equal(emailConflictMessage(409), "Ese correo ya lo tiene otra persona.");
  assert.equal(emailConflictMessage(400), null);
});
