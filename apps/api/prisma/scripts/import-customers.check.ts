import { strict as assert } from "assert";
import {
  clean,
  COMPANY_PREFIX_BY_SHEET,
  isActive,
  nitCheckDigit,
  normalizeSeller,
  parseCustomerType,
  parsePayment,
  parseTaxId,
} from "./import-customers";

// DV DIAN: solo se usa para reportar, nunca para reescribir el NIT.
assert.equal(nitCheckDigit("900561013"), 7);
assert.equal(nitCheckDigit("811037852"), 0);
assert.equal(nitCheckDigit("800159629"), 8);
// El DV que trae el Excel se respeta aunque no cuadre con el calculado.
assert.equal(parseTaxId("NIT 800197463 5")!.taxId, "800197463-5");
// Y por eso las dos filas del mismo NIT entran como dos clientes distintos.
assert.notEqual(parseTaxId("NIT 800197463 4")!.key, parseTaxId("NIT 800197463 5")!.key);
// Sin DV en la hoja no se inventa uno: una cedula no lo tiene.
assert.equal(parseTaxId("CC 915108090")!.taxId, "915108090");


// parseTaxId: el separador de digito de verificacion y los prefijos son lo
// unico que puede colisionar taxId (@unique) o duplicar clientes entre hojas.
const ids = (raw: unknown) => {
  const p = parseTaxId(raw);
  return p && { key: p.key, taxId: p.taxId };
};
assert.deepEqual(ids("NIT 900561013 7"), { key: "900561013-7", taxId: "900561013-7" });
assert.deepEqual(ids("CC 915108090"), { key: "915108090", taxId: "915108090" });
assert.deepEqual(ids("901145555"), { key: "901145555", taxId: "901145555" });
// Sin DV la clave es el NIT pelado, asi que NO colapsa con la version con DV.
assert.notEqual(parseTaxId("NIT 901145555 7")!.key, parseTaxId("901145555")!.key);
assert.deepEqual(ids("OTRO 222222222 7"), { key: "222222222-7", taxId: "222222222-7" });
assert.deepEqual(ids("Documento de identificación extranjero J412708872"), {
  key: "J412708872",
  taxId: "J412708872",
});
assert.equal(parseTaxId("   "), null);
assert.equal(parseTaxId(null), null);

assert.equal(parseCustomerType("DIRECTO "), "cliente_directo");
assert.equal(parseCustomerType("DISTRIBUIDOR"), "distribuidor");
assert.equal(parseCustomerType("DISTRIBUIDOR;DIRECTO"), "distribuidor");
assert.equal(parseCustomerType(""), "cliente_directo");

// Tipo vacio = cliente que compro alguna vez pero hoy no -> inactivo.
assert.equal(isActive(""), false);
assert.equal(isActive(null), false);
assert.equal(isActive("   "), false);
assert.equal(isActive("DIRECTO "), true);
assert.equal(isActive("DISTRIBUIDOR"), true);

assert.deepEqual(parsePayment(30), { paymentCondition: "credito_30", paymentDays: 30 });
assert.deepEqual(parsePayment("contado"), { paymentCondition: "contado", paymentDays: 0 });
assert.deepEqual(parsePayment(""), { paymentCondition: "contado", paymentDays: 0 });
// 45 no es un bucket valido del enum: cae a contado en vez de reventar.
assert.deepEqual(parsePayment(45), { paymentCondition: "contado", paymentDays: 0 });

assert.equal(normalizeSeller("BREYNER"), "BREYNER VALLE");
assert.equal(normalizeSeller("NATALIA "), "NATALIA");
assert.equal(normalizeSeller(""), null);

assert.equal(clean({ text: "a@b.com", hyperlink: "mailto:a@b.com" }), "a@b.com");
assert.equal(clean(6053448029), "6053448029");

// Cada hoja pertenece a una empresa distinta.
assert.equal(COMPANY_PREFIX_BY_SHEET.NORGTECH, "NT");
assert.equal(COMPANY_PREFIX_BY_SHEET.NANONUTRICION, "NN");

console.log("import-customers: OK");
