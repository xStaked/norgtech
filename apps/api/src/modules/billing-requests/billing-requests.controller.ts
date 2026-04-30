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
import { BillingRequestStatus } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { BillingRequestsService } from "./billing-requests.service";
import { UpdateBillingStatusDto } from "./dto/update-billing-status.dto";
import { CreateBillingRequestDto } from "./dto/create-billing-request.dto";

@Controller("billing-requests")
export class BillingRequestsController {
  constructor(private readonly billingRequestsService: BillingRequestsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "facturacion")
  @Get()
  findAll(@Query("status") status?: BillingRequestStatus) {
    return this.billingRequestsService.findAll(status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "facturacion")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.billingRequestsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "facturacion")
  @Post()
  createDirect(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateBillingRequestDto,
  ) {
    return this.billingRequestsService.createDirect(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "facturacion")
  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateBillingStatusDto,
  ) {
    return this.billingRequestsService.updateStatus(user, id, dto);
  }
}
