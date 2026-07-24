import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { IncludeInactiveQueryDto } from "../../common/dto/include-inactive.query";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { UpsertPriceListItemDto } from "./dto/upsert-price-list-item.dto";
import { PriceListsService } from "./price-lists.service";

const listQueryPipe = new ValidationPipe({ transform: true, whitelist: true });
const bodyPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

@Controller("price-lists")
export class PriceListsController {
  constructor(private readonly priceListsService: PriceListsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get()
  findAll(@Query(listQueryPipe) query: IncludeInactiveQueryDto) {
    return this.priceListsService.findAll(query.includeInactive);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.priceListsService.findOne(id);
  }

  // Cambiar un precio cambia lo que se le cotiza al cliente: solo admin y
  // dirección comercial, igual que crear productos.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Put(":id/items")
  upsertItem(@Param("id") id: string, @Body(bodyPipe) dto: UpsertPriceListItemDto) {
    return this.priceListsService.upsertItem(id, dto);
  }
}
