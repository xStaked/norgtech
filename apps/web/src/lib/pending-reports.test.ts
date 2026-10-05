// node --test src/lib/pending-reports.test.ts   (desde apps/web)
import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingReportVisits } from "./pending-reports.ts";

const visits = [
  { id: "v1", status: "completada", summary: "hola", customer: { displayName: "A" } },
  { id: "v2", status: "completada", summary: "hola", customer: { displayName: "B" } },
  { id: "v3", status: "programada", summary: null, customer: { displayName: "C" } },
  { id: "v4", status: "completada", summary: "", customer: { displayName: "D" } },
] as never[];

test("solo completadas con resumen y sin reporte", () => {
  const reports = [{ id: "r1", visit: { id: "v2" } }] as never[];
  assert.deepEqual(
    pendingReportVisits(visits, reports).map((v: { id: string }) => v.id),
    ["v1"],
  );
});

test("sin reportes todo lo generable es pendiente", () => {
  assert.deepEqual(
    pendingReportVisits(visits, []).map((v: { id: string }) => v.id),
    ["v1", "v2"],
  );
});
