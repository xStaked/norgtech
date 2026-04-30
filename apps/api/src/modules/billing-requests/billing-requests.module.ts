import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { BillingRequestsController } from "./billing-requests.controller";
import { BillingRequestsService } from "./billing-requests.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [BillingRequestsController],
  providers: [BillingRequestsService],
})
export class BillingRequestsModule {}
