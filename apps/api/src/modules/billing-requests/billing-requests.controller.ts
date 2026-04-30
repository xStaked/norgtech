import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { BillingRequestsService } from "./billing-requests.service";
import { UpdateBillingStatusDto } from "./dto/update-billing-status.dto";

@Controller("billing-requests")
export class BillingRequestsController {
  constructor(private readonly billingRequestsService: BillingRequestsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Get()
  findAll() {
    return this.billingRequestsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.billingRequestsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
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
