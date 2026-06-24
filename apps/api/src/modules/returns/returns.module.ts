import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { ReturnsController } from "./returns.controller";
import { ReturnsService } from "./returns.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
