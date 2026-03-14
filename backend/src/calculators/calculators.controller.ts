import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CalculatorsService } from './calculators.service';
import { CreateFcaCalculationDto } from './dto/create-fca-calculation.dto';
import { CreateRoiDto } from './dto/create-roi.dto';
import { ListRoiQueryDto } from './dto/list-roi-query.dto';
import { ProductionSimulationDto } from './dto/production-simulation.dto';

@ApiTags('Calculators')
@ApiBearerAuth()
@Controller('calculators')
@Roles('admin', 'asesor_tecnico', 'asesor_comercial')
export class CalculatorsController {
  constructor(private readonly calculatorsService: CalculatorsService) {}

  @Post('fca')
  @ApiOperation({ summary: 'Calcular FCA y guardar historial del usuario' })
  createFcaCalculation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFcaCalculationDto,
  ) {
    return this.calculatorsService.createFcaCalculation(user, dto);
  }

  @Get('fca')
  @ApiOperation({ summary: 'Obtener historial reciente de cálculos FCA del usuario' })
  getFcaHistory(@CurrentUser() user: AuthUser) {
    return this.calculatorsService.getFcaHistory(user);
  }

  @Post('roi')
  @ApiOperation({ summary: 'Calcular ROI y guardar historial del usuario' })
  createRoiCalculation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRoiDto,
  ) {
    return this.calculatorsService.createRoiCalculation(user, dto);
  }

  @Get('roi')
  @ApiOperation({ summary: 'Obtener historial reciente de cálculos ROI del usuario' })
  getRoiHistory(
    @CurrentUser() user: AuthUser,
    @Query() query: ListRoiQueryDto,
  ) {
    return this.calculatorsService.getRoiHistory(user, query);
  }

  @Post('production-sim')
  @ApiOperation({ summary: 'Ejecutar simulación de producción sin guardar' })
  runProductionSimulation(@Body() dto: ProductionSimulationDto) {
    return this.calculatorsService.runProductionSimulation(dto);
  }
}
