"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

interface QueueItem {
  id: string;
  kind: "task" | "visit";
  title: string;
  customerName: string;
  scheduledAt: string;
  status: string;
}

const timeFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
});

const queueStatusVariant: Record<string, string> = {
  programada: "warning",
  pendiente: "warning",
  vencida: "destructive",
  completada: "default",
  no_realizada: "secondary",
  cancelada: "destructive",
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface QueueListProps {
  items: QueueItem[];
}

export function QueueList({ items }: QueueListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
        <p className="mt-2 text-sm text-muted-foreground">Sin elementos asignados</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-3"
    >
      {items.map((item) => {
        const href = item.kind === "visit" ? `/visits/${item.id}` : `/follow-ups/${item.id}`;
        return (
          <motion.div key={`${item.kind}-${item.id}`} variants={itemVariants}>
            <Link
              href={href}
              className="group block rounded-lg border border-border/30 bg-muted/30 p-3 transition-all hover:border-border/60 hover:bg-muted/60"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge
                  variant={queueStatusVariant[item.status] as "default" | "secondary" | "destructive" | "outline"}
                  className="text-[10px] uppercase"
                >
                  {item.kind === "visit" ? "Visita" : "Seguimiento"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {timeFormatter.format(new Date(item.scheduledAt))}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground">{item.customerName}</p>
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
