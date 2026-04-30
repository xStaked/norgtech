import { Injectable } from "@nestjs/common";

@Injectable()
export class PrismaService {
  readonly datasourceUrl = process.env.DATABASE_URL;
}
