"use client";

import { motion } from "framer-motion";
import { Clock } from "lucide-react";

interface ActivityItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorName: string;
  createdAt: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface ActivityListProps {
  items: ActivityItem[];
}

export function ActivityList({ items }: ActivityListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          Sin actividad reciente
        </p>
        <p className="text-xs text-muted-foreground/70">
          Cuando el equipo registre movimientos comerciales, aparecerán aquí.
        </p>
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
      {items.map((item) => (
        <motion.div
          key={item.id}
          variants={itemVariants}
          className="group flex items-start gap-3 rounded-lg border border-border/30 bg-muted/30 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-foreground">{item.entityType}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{item.action}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>por {item.actorName}</span>
              <span>{dateTimeFormatter.format(new Date(item.createdAt))}</span>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
