import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { LauraController } from "./laura.controller";
import { LauraService } from "./laura.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [LauraController],
  providers: [LauraService],
  exports: [LauraService],
})
export class LauraModule {}
