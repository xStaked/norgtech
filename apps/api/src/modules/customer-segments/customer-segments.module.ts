import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomerSegmentsController } from "./customer-segments.controller";
import { CustomerSegmentsService } from "./customer-segments.service";

@Module({
  imports: [AuthModule],
  controllers: [CustomerSegmentsController],
  providers: [CustomerSegmentsService],
})
export class CustomerSegmentsModule {}
