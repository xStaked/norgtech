import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { FollowUpTasksController } from "./follow-up-tasks.controller";
import { FollowUpTasksService } from "./follow-up-tasks.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [FollowUpTasksController],
  providers: [FollowUpTasksService],
  exports: [FollowUpTasksService],
})
export class FollowUpTasksModule {}
