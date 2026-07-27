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
  id?: string;
  required?: boolean;
  /** Que lista de usuarios ofrecer. `/users/logistics` para la seccion Logistica. */
  endpoint?: string;
  searchPlaceholder?: string;
}

// CLI-01: reemplaza el input de texto libre "Asignado a (ID de usuario)" por un
// selector real. Espeja CompanySelect (mismo patron controlado/no controlado y
// estilos). Se autoabastece de GET /users/sellers ({id,name}), abierto a
// admin/comercial/director/logistica — NO usa GET /users, que es solo admin.
export function UserSelect({
  value,
  onChange,
  name = "assignedToUserId",
  id,
  required = false,
  endpoint = "/users/sellers",
  searchPlaceholder = "Buscar vendedor…",
}: UserSelectProps) {
  const [sellers, setSellers] = useState<Seller[] | null>(null);
  // Siempre controlado: las opciones llegan despues del primer render.
  const [internal, setInternal] = useState(value ?? "");

  useEffect(() => {
    apiFetchClient(endpoint)
      .then((res) => res.json())
      .then(setSellers)
      .catch(() => setSellers([]));
  }, [endpoint]);

  return (
    <Select
      name={name}
      id={id}
      required={required}
      loading={sellers === null}
      placeholder="Sin asignar"
      searchPlaceholder={searchPlaceholder}
      value={onChange ? (value ?? "") : internal}
      onValueChange={onChange ?? setInternal}
      options={[
        ...(required ? [] : [{ value: "", label: "Sin asignar" }]),
        ...(sellers ?? []).map((seller) => ({ value: seller.id, label: seller.name })),
      ]}
    />
  );
}
