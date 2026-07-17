"use client";

import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";

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
  const [zones, setZones] = useState<Zone[]>([]);

  useEffect(() => {
    apiFetchClient("/zones")
      .then((res) => res.json())
      .then(setZones)
      .catch(() => setZones([]));
  }, []);

  const className =
    "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  if (onChange) {
    return (
      <select
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={className}
      >
        <option value="">Seleccionar zona</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      required={required}
      className={className}
    >
      <option value="">Seleccionar zona</option>
      {zones.map((z) => (
        <option key={z.id} value={z.id}>
          {z.name}
        </option>
      ))}
    </select>
  );
}
