"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ReturnForm,
  type ReturnFormCustomer,
  type ReturnFormInvoice,
} from "@/components/returns/return-form";

export function CreateReturnModal({
  customers,
  invoices,
}: {
  customers: ReturnFormCustomer[];
  invoices: ReturnFormInvoice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Nueva devolucion</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva devolucion</DialogTitle>
          </DialogHeader>
          <ReturnForm
            customers={customers}
            invoices={invoices}
            onSuccess={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
