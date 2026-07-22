"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { apiFetchClient } from "@/lib/api.client";
import { usePollCount } from "@/lib/use-poll-count";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  entityType: string;
  entityId: string;
  createdAt: string;
}

/** Ruta de detalle por tipo de entidad. Un solo lugar que tocar si cambian. */
const ENTITY_ROUTES: Record<string, string> = {
  order: "/orders",
  customer: "/customers",
  visit: "/visits",
  follow_up_task: "/follow-ups",
  commercial_expense: "/expenses",
};

export function notificationHref(entityType: string, entityId: string): string {
  const base = ENTITY_ROUTES[entityType];
  return base ? `${base}/${entityId}` : "/dashboard";
}

export function NotificationBell() {
  const router = useRouter();
  const { count, refresh } = usePollCount("/notifications/unread-count");
  const [items, setItems] = useState<NotificationItem[]>([]);

  async function loadItems(open: boolean) {
    if (!open) return;
    const res = await apiFetchClient("/notifications?unread=true&limit=20");
    if (res.ok) {
      setItems((await res.json()) as NotificationItem[]);
    }
  }

  async function openItem(item: NotificationItem) {
    await apiFetchClient(`/notifications/${item.id}/read`, { method: "PATCH" });
    void refresh();
    router.push(notificationHref(item.entityType, item.entityId));
  }

  async function markAll() {
    await apiFetchClient("/notifications/read-all", { method: "POST" });
    setItems([]);
    void refresh();
  }

  return (
    <DropdownMenu onOpenChange={loadItems}>
      <DropdownMenuTrigger className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute right-2 top-1.5 h-[7px] w-[7px] rounded-full border-2 border-card bg-destructive" />
        )}
        <span className="sr-only">
          {count > 0 ? `${count} notificaciones sin leer` : "Notificaciones"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[12.5px] font-semibold">Notificaciones</span>
          {items.length > 0 && (
            <button
              onClick={markAll}
              className="text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              Marcar todas
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-2 py-3 text-[12.5px] text-muted-foreground">
            No tienes notificaciones sin leer.
          </p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => openItem(item)}
              className="flex flex-col items-start gap-0.5"
            >
              <span className="text-[12.5px] font-medium">{item.title}</span>
              {item.body && (
                <span className="text-[11.5px] text-muted-foreground">
                  {item.body}
                </span>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
