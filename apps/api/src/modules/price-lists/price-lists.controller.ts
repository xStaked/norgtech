import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { IncludeInactiveQueryDto } from "../../common/dto/include-inactive.query";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { ApprovalPriceListDto } from "./dto/approval-price-list.dto";
import { UpsertPriceListItemDto } from "./dto/upsert-price-list-item.dto";
import { PriceListsService } from "./price-lists.service";

const listQueryPipe = new ValidationPipe({ transform: true, whitelist: true });
const bodyPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

@Controller("price-lists")
export class PriceListsController {
  constructor(private readonly priceListsService: PriceListsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion", "promotor")
  @Get()
  findAll(@Query(listQueryPipe) query: IncludeInactiveQueryDto) {
    return this.priceListsService.findAll(query.includeInactive);
  }

  // Ruta fija ANTES de `:id`: si va después, "last-sold" cae en findOne
  // como si fuera un id de lista.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion", "promotor")
  @Get("last-sold")
  findLastSoldPrice(
    @Query("customerId") customerId?: string,
    @Query("productId") productId?: string,
  ) {
    if (!customerId?.trim() || !productId?.trim()) {
      throw new BadRequestException("customerId y productId son obligatorios");
    }
    return this.priceListsService.findLastSoldPrice(customerId, productId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion", "promotor")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.priceListsService.findOne(id);
  }

  // Cambiar un precio cambia lo que se le cotiza al cliente: solo admin y
  // dirección comercial, igual que crear productos.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "promotor")
  @Put(":id/items")
  upsertItem(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(bodyPipe) dto: UpsertPriceListItemDto,
  ) {
    return this.priceListsService.upsertItem(id, dto, user);
  }

  // Aprobar una lista libera sus precios en cotizaciones: solo admin y
  // dirección comercial, igual que cambiar precios.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "promotor")
  @Patch(":id/approval")
  updateApproval(
    @Param("id") id: string,
    @Body(bodyPipe) dto: ApprovalPriceListDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.priceListsService.updateApproval(id, dto.action, user);
  }
}
