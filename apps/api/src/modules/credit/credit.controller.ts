import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreditService } from "./credit.service";

@Controller("credit")
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get("customers/:customerId/summary")
  getCustomerCreditSummary(
    @CurrentUser() user: AuthUser,
    @Param("customerId") customerId: string,
  ) {
    return this.creditService.getCreditSummary(customerId, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get("dashboard/alerts")
  getDashboardAlerts(
    @CurrentUser() user: AuthUser,
    @Query("companyId") companyId?: string,
  ) {
    return this.creditService.getCreditAlerts(companyId, user);
  }
}
