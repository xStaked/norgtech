import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "./modules/auth/auth.module";
import { CustomerSegmentsModule } from "./modules/customer-segments/customer-segments.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule, AuthModule, CustomerSegmentsModule],
  controllers: [HealthController],
})
export class AppModule {}
