import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomerGoalsModule } from "../customer-goals/customer-goals.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsCron } from "./notifications.cron";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [AuthModule, CustomerGoalsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsCron],
  exports: [NotificationsService],
})
export class NotificationsModule {}
