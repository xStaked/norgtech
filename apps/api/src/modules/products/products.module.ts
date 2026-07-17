import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PricingModule } from "../pricing/pricing.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [AuthModule, PricingModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
