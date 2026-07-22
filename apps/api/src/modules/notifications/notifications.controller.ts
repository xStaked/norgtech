import { Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { NotificationsService } from "./notifications.service";

/**
 * Sin `@Roles`: la campana es personal. Cada endpoint filtra por el usuario
 * del token, asi que no hay rol que pueda leer la campana de otro.
 */
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("unread") unread?: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = Number(limit);
    return this.notifications.list(user.id, {
      unread: unread === "true",
      limit: Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20,
    });
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }
}
