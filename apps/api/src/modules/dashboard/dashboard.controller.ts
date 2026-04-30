import { Controller, Get, UseGuards } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Get("summary")
  getSummary() {
    return this.dashboardService.getSummary();
  }
}
