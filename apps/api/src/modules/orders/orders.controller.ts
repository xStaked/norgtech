import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
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
  @Roles("admin", "comercial")
  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.ordersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
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
  @Roles("admin", "comercial")
  @Post(":id/billing-request")
  createBillingRequest(
    @CurrentUser() user: AuthUser,
    @Param("id") orderId: string,
  ) {
    return this.ordersService.createBillingRequest(user, orderId);
  }
}
