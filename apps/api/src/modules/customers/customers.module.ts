import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
