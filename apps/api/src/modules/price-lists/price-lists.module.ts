import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PriceListsController } from "./price-lists.controller";
import { PriceListsService } from "./price-lists.service";

@Module({
  imports: [AuthModule],
  controllers: [PriceListsController],
  providers: [PriceListsService],
})
export class PriceListsModule {}
