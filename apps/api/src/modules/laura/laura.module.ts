import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { LauraContextResolverService } from "./laura-context-resolver.service";
import { LauraController } from "./laura.controller";
import { LauraSessionService } from "./laura-session.service";
import { LauraService } from "./laura.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [LauraController],
  providers: [LauraService, LauraSessionService, LauraContextResolverService],
  exports: [LauraService],
})
export class LauraModule {}
