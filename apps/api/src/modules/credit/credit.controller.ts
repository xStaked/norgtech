import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CreditService } from "./credit.service";

@Controller("credit")
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Get("customers/:customerId/summary")
  getCustomerCreditSummary(@Param("customerId") customerId: string) {
    return this.creditService.getCreditSummary(customerId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get("dashboard/alerts")
  getDashboardAlerts(@Query("companyId") companyId?: string) {
    return this.creditService.getCreditAlerts(companyId);
  }
}
