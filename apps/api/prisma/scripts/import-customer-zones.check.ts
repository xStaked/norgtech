import { strict as assert } from "assert";
import { splitZones } from "./import-customer-zones";

// Un cliente puede estar en varias zonas: "SANTANDER;BOGOTA;ANTIOQUIA;COSTA".
assert.deepEqual(splitZones("SANTANDER;BOGOTA;ANTIOQUIA;COSTA"), [
  "SANTANDER",
  "BOGOTA",
  "ANTIOQUIA",
  "COSTA",
]);

// El Excel trae espacios sueltos: "ANTIOQUIA ;VALLE DEL CAUCA".
assert.deepEqual(splitZones("ANTIOQUIA ;VALLE DEL CAUCA"), ["ANTIOQUIA", "VALLE DEL CAUCA"]);

// Mismo nombre escrito distinto no debe crear dos zonas.
assert.deepEqual(splitZones("santander"), splitZones("SANTANDER  "));

// Vacío y separadores sueltos no generan zonas fantasma.
assert.deepEqual(splitZones(""), []);
assert.deepEqual(splitZones(null), []);
assert.deepEqual(splitZones(";;"), []);

console.log("import-customer-zones.check: OK");
