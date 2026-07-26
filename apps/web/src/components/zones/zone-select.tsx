"use client";

import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
import { Select } from "@/components/ui/select";

interface Zone {
  id: string;
  name: string;
}

interface ZoneSelectProps {
  value?: string;
  onChange?: (zoneId: string) => void;
  name?: string;
  required?: boolean;
}

// CLI-04/ORD-06: selector de zona. Espeja CompanySelect. Llama GET /zones SIN el
// parametro ?includeInactive, asi que solo ofrece zonas activas (el backend por
// defecto filtra active-only).
export function ZoneSelect({
  value,
  onChange,
  name = "zoneId",
  required = false,
}: ZoneSelectProps) {
  const [zones, setZones] = useState<Zone[] | null>(null);
  // Siempre controlado: las opciones llegan despues del primer render, y un
  // valor por defecto no encuentra su opcion si se fija al montar.
  const [internal, setInternal] = useState(value ?? "");

  useEffect(() => {
    apiFetchClient("/zones")
      .then((res) => res.json())
      .then(setZones)
      .catch(() => setZones([]));
  }, []);

  return (
    <Select
      name={name}
      required={required}
      loading={zones === null}
      placeholder="Seleccionar zona"
      searchPlaceholder="Buscar zona…"
      value={onChange ? (value ?? "") : internal}
      onValueChange={onChange ?? setInternal}
      options={[
        { value: "", label: "Seleccionar zona" },
        ...(zones ?? []).map((zone) => ({ value: zone.id, label: zone.name })),
      ]}
    />
  );
}
