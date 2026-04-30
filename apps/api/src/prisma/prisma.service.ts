import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  readonly datasourceUrl = process.env.DATABASE_URL;
  private isConnected = false;

  async onModuleInit() {
    if (!this.datasourceUrl) {
      return;
    }

    await this.$connect();
    this.isConnected = true;
  }

  async onModuleDestroy() {
    if (!this.isConnected) {
      return;
    }

    await this.$disconnect();
    this.isConnected = false;
  }
}
