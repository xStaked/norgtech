import { Body, Controller, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CalculatorsService } from "./calculators.service";
import { CostCalculationDto } from "./dto/cost-calculation.dto";
import { RoiCalculationDto } from "./dto/roi-calculation.dto";

@Controller("calculators")
export class CalculatorsController {
  constructor(private readonly calculatorsService: CalculatorsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "tecnico")
  @Post("roi")
  calculateROI(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: RoiCalculationDto,
  ) {
    return this.calculatorsService.calculateROI({
      investment: dto.investment,
      annualSavings: dto.annualSavings,
      annualRevenueIncrease: dto.annualRevenueIncrease,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "tecnico")
  @Post("costs")
  calculateCosts(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CostCalculationDto,
  ) {
    return this.calculatorsService.calculateCosts({
      unitCost: dto.unitCost,
      quantity: dto.quantity,
      installationCost: dto.installationCost,
      maintenanceAnnual: dto.maintenanceAnnual,
    });
  }
}
