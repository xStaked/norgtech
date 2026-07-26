"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { Select } from "@/components/ui/select";

/**
 * Banco de pruebas del Select: el unico sitio donde se ven de golpe el umbral de
 * busqueda, los grupos, el estado vacio y ayuda/error. Lo recorre
 * `tests/e2e/dev-select.spec.ts`. Nunca sale a produccion.
 */

const MANY = Array.from({ length: 12 }, (_, i) => ({
  value: `c${i}`,
  label: `Cliente ${String.fromCharCode(65 + i)}`,
}));

const GROUPED = [
  { value: "", label: "¿Para quién?" },
  { value: "g1", label: "GUATEMALA", meta: "46 ítems · Guatemala", group: "Países" },
  { value: "s1", label: "DIRECTOS", meta: "512 ítems · Colombia", group: "Segmentos" },
  { value: "s2", label: "DISTRIBUIDORES", meta: "498 ítems · Colombia", group: "Segmentos" },
];

export default function Page() {
  const [few, setFew] = useState("b");
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <form className="grid max-w-md gap-4 p-8">
      <Select
        name="pocas"
        value={few}
        onValueChange={setFew}
        options={[
          { value: "a", label: "Anual" },
          { value: "b", label: "Mensual" },
        ]}
      />
      <Select name="muchas" required options={[{ value: "", label: "Elegir" }, ...MANY]} />
      <Select name="agrupadas" options={GROUPED} />
      <Select name="roto" options={MANY} error="La unidad es obligatoria" hint="no debe verse" />
      <Select name="apagado" options={MANY} disabled hint="Elige primero un producto." />
      <Select name="cargando" options={[]} loading />
    </form>
  );
}
