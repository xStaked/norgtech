import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { LauraAgentsController } from "./laura-agents.controller";

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [LauraAgentsController],
})
export class LauraAgentsModule {}