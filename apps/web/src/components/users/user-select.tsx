"use client";

import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";

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
  const [sellers, setSellers] = useState<Seller[]>([]);

  useEffect(() => {
    apiFetchClient("/users/sellers")
      .then((res) => res.json())
      .then(setSellers)
      .catch(() => setSellers([]));
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
        {!required && <option value="">Sin asignar</option>}
        {sellers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
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
      {!required && <option value="">Sin asignar</option>}
      {sellers.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
