import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { SellerGoalsService } from "../seller-goals/seller-goals.service";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly sellerGoalsService: SellerGoalsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica")
  @Get("summary")
  getSummary(
    @CurrentUser() user: AuthUser,
    @Query("companyId") companyId?: string,
  ) {
    return this.dashboardService.getSummary(user, companyId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get("commercial-advanced")
  getCommercialAdvanced(
    @CurrentUser() user: AuthUser,
    @Query("days") days?: string,
    @Query("companyId") companyId?: string,
  ) {
    return this.dashboardService.getCommercialAdvancedSummary(user, days, companyId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Get("seller-goals")
  getSellerGoals(
    @CurrentUser() user: AuthUser,
    @Query("periodType") periodType?: string,
    @Query("periodValue") periodValue?: string,
    @Query("companyId") companyId?: string,
  ) {
    return this.sellerGoalsService.getDashboard(
      user,
      periodType,
      periodValue,
      companyId,
    );
  }
}
