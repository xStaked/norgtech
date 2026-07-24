import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import {
  CreateProductPresentationDto,
  UpdateProductPresentationDto,
} from "./dto/product-presentation.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

const listQueryPipe = new ValidationPipe({ transform: true, whitelist: true });
const bodyPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

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
    @Query("presentationId") presentationId?: string,
  ) {
    return this.productsService.getPriceForCustomer(id, customerId, presentationId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(bodyPipe) dto: UpdateProductDto,
  ) {
    return this.productsService.update(user, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Post(":id/presentations")
  addPresentation(@Param("id") id: string, @Body(bodyPipe) dto: CreateProductPresentationDto) {
    return this.productsService.addPresentation(id, dto);
  }
}

@Controller("product-presentations")
export class ProductPresentationsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Patch(":id")
  update(@Param("id") id: string, @Body(bodyPipe) dto: UpdateProductPresentationDto) {
    return this.productsService.updatePresentation(id, dto);
  }
}
