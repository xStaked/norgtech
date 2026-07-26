"use client";

import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
import { Select } from "@/components/ui/select";

interface Seller {
  id: string;
  name: string;
}

interface UserSelectProps {
  value?: string;
  onChange?: (userId: string) => void;
  name?: string;
  required?: boolean;
}

// CLI-01: reemplaza el input de texto libre "Asignado a (ID de usuario)" por un
// selector real. Espeja CompanySelect (mismo patron controlado/no controlado y
// estilos). Se autoabastece de GET /users/sellers ({id,name}), abierto a
// admin/comercial/director/logistica — NO usa GET /users, que es solo admin.
export function UserSelect({
  value,
  onChange,
  name = "assignedToUserId",
  required = false,
}: UserSelectProps) {
  const [sellers, setSellers] = useState<Seller[] | null>(null);
  // Siempre controlado: las opciones llegan despues del primer render.
  const [internal, setInternal] = useState(value ?? "");

  useEffect(() => {
    apiFetchClient("/users/sellers")
      .then((res) => res.json())
      .then(setSellers)
      .catch(() => setSellers([]));
  }, []);

  return (
    <Select
      name={name}
      required={required}
      loading={sellers === null}
      placeholder="Sin asignar"
      searchPlaceholder="Buscar vendedor…"
      value={onChange ? (value ?? "") : internal}
      onValueChange={onChange ?? setInternal}
      options={[
        ...(required ? [] : [{ value: "", label: "Sin asignar" }]),
        ...(sellers ?? []).map((seller) => ({ value: seller.id, label: seller.name })),
      ]}
    />
  );
}
