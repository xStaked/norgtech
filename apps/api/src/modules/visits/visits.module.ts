import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { VisitsController } from "./visits.controller";
import { VisitsService } from "./visits.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
