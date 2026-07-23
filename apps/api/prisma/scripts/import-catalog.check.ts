import { strict as assert } from "assert";
import { prodKey, skuFromName, deriveTaxPercent, num, clean } from "./import-catalog";

// prodKey colapsa variantes de espaciado al mismo producto.
assert.equal(prodKey("ASATECH"), prodKey("ASA TECH"));
assert.equal(prodKey("ace k"), "ACEK");

// SKU determinista, sin acentos ni símbolos, con prefijo.
assert.equal(skuFromName("ACE K"), "CAT-ACEK");
assert.equal(skuFromName("PREMEZCLA VACA ORDEÑOS"), "CAT-PREMEZCLAVACAORDENOS");
// Mismo producto escrito distinto NO colisiona de forma distinta (idempotente).
assert.equal(skuFromName("ASATECH"), skuFromName("ASA TECH"));

// IVA derivado del ratio con/sin: 0% exento, 5%, nunca 19%.
assert.equal(deriveTaxPercent(86476.19, 90800), 5);
assert.equal(deriveTaxPercent(45950, 45950), 0);
assert.equal(deriveTaxPercent(null, 100), null); // sin par1 sin precio
assert.equal(deriveTaxPercent(100, null), null);

// num tolera celdas de fórmula ({result}) y descarta no-números.
assert.equal(num({ result: 1234 }), 1234);
assert.equal(num("x"), null);
assert.equal(num(Infinity), null);

// clean aplana hyperlink/fórmula y colapsa espacios.
assert.equal(clean({ text: "  a   b " }), "a b");
assert.equal(clean(null), "");

console.log("import-catalog.check: OK");
