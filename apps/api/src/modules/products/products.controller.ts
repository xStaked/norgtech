import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { IncludeInactiveQueryDto } from "../../common/dto/include-inactive.query";
import { CreateProductDto } from "./dto/create-product.dto";
import { ProductsService } from "./products.service";

const listQueryPipe = new ValidationPipe({ transform: true, whitelist: true });

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateProductDto,
  ) {
    return this.productsService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get()
  findAll(@Query(listQueryPipe) query: IncludeInactiveQueryDto) {
    return this.productsService.findAll(query.includeInactive);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.productsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get(":id/price-for-customer/:customerId")
  getPriceForCustomer(
    @Param("id") id: string,
    @Param("customerId") customerId: string,
  ) {
    return this.productsService.getPriceForCustomer(id, customerId);
  }
}
