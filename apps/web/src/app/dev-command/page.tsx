"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * Banco de pruebas del command palette (el buscador del topbar). Lo recorre
 * `tests/e2e/dev-command.spec.ts`: si CommandDialog vuelve a quedarse sin su
 * <Command>, abrirlo revienta y el test lo caza. Nunca sale a produccion.
 */
export default function Page() {
  const [open, setOpen] = useState(false);
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="p-8">
      <button type="button" onClick={() => setOpen(true)}>
        Abrir buscador
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Buscar">
        <CommandInput placeholder="Buscar…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Modulos">
            <CommandItem value="Clientes">Clientes</CommandItem>
            <CommandItem value="Pedidos">Pedidos</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
