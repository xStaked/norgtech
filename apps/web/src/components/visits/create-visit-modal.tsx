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
import { VisitForm } from "@/components/visits/visit-form";

export function CreateVisitModal({
  customers,
  opportunities,
}: {
  customers: Array<{ id: string; displayName: string }>;
  opportunities: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Nueva visita</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva visita</DialogTitle>
          </DialogHeader>
          <VisitForm
            customers={customers}
            opportunities={opportunities}
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
