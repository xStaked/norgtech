import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { UpdateOrderLogisticsDto } from "./dto/update-order-logistics.dto";
import { ResolveOrderItemDto } from "./dto/resolve-order-item.dto";
import { OrdersService } from "./orders.service";
import { OrderStatus } from "@prisma/client";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "logistica")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateOrderDto,
  ) {
    return this.ordersService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "facturacion", "logistica")
  @Get()
  findAll(@Query("status") status?: OrderStatus, @Query("companyId") companyId?: string) {
    return this.ordersService.findAll(status, companyId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "facturacion", "logistica")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.ordersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "facturacion", "logistica")
  @Get(":id/export")
  async exportClientFormat(@Param("id") id: string, @Res() response: Response) {
    const workbook = await this.ordersService.exportClientFormat(id);
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader("Content-Disposition", `attachment; filename="pedido-${id}.xlsx"`);
    response.send(workbook);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "logistica")
  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") orderId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(user, orderId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "logistica")
  @Patch(":id/logistics")
  updateLogistics(
    @CurrentUser() user: AuthUser,
    @Param("id") orderId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateOrderLogisticsDto,
  ) {
    return this.ordersService.updateLogistics(user, orderId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "facturacion")
  @Patch(":id/items/:itemId/resolve")
  resolveItem(
    @CurrentUser() user: AuthUser,
    @Param("id") orderId: string,
    @Param("itemId") itemId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: ResolveOrderItemDto,
  ) {
    return this.ordersService.resolveOrderItem(user, orderId, itemId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "facturacion")
  @Post(":id/billing-request")
  createBillingRequest(
    @CurrentUser() user: AuthUser,
    @Param("id") orderId: string,
  ) {
    return this.ordersService.createBillingRequest(user, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "facturacion")
  @Post(":id/invoice")
  createInvoiceFromOrder(
    @CurrentUser() user: AuthUser,
    @Param("id") orderId: string,
  ) {
    return this.ordersService.createInvoiceFromOrder(user, orderId);
  }
}
