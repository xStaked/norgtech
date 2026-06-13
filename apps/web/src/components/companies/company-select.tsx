"use client";

import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";

interface Company {
  id: string;
  name: string;
  prefix: string;
}

interface CompanySelectProps {
  value?: string;
  onChange?: (companyId: string) => void;
  name?: string;
  required?: boolean;
  includeAll?: boolean;
}

export function CompanySelect({
  value,
  onChange,
  name = "companyId",
  required = false,
  includeAll = false,
}: CompanySelectProps) {
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    apiFetchClient("/companies")
      .then((res) => res.json())
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  if (onChange) {
    return (
      <select
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {includeAll && <option value="">Todas</option>}
        {!required && !includeAll && <option value="">Seleccionar empresa</option>}
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.prefix})
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
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {includeAll && <option value="">Todas</option>}
      {!required && !includeAll && <option value="">Seleccionar empresa</option>}
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.prefix})
        </option>
      ))}
    </select>
  );
}
