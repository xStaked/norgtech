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
import { FollowUpTaskForm } from "@/components/follow-ups/follow-up-task-form";

export function CreateFollowUpModal({
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
      <Button onClick={() => setOpen(true)}>Nueva tarea</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva tarea de seguimiento</DialogTitle>
          </DialogHeader>
          <FollowUpTaskForm
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
