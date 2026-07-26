"use client";

import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
import { Select } from "@/components/ui/select";

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
  const [companies, setCompanies] = useState<Company[] | null>(null);
  // Siempre controlado: las opciones llegan despues del primer render.
  const [internal, setInternal] = useState(value ?? "");

  useEffect(() => {
    apiFetchClient("/companies")
      .then((res) => res.json())
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  const emptyLabel = includeAll ? "Todas" : "Seleccionar empresa";

  return (
    <Select
      name={name}
      required={required}
      loading={companies === null}
      placeholder={emptyLabel}
      searchPlaceholder="Buscar empresa…"
      value={onChange ? (value ?? "") : internal}
      onValueChange={onChange ?? setInternal}
      options={[
        ...(includeAll || !required ? [{ value: "", label: emptyLabel }] : []),
        ...(companies ?? []).map((company) => ({
          value: company.id,
          label: company.name,
          badge: (
            <span className="shrink-0 rounded bg-secondary px-1.5 py-px text-[9.5px] font-extrabold text-secondary-foreground">
              {company.prefix}
            </span>
          ),
        })),
      ]}
    />
  );
}
