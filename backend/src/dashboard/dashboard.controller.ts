import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin-stats')
  @ApiOperation({ summary: 'Obtener KPIs globales de la organización' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial')
  getAdminStats(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getAdminStats(user);
  }

  @Get('advisor-stats')
  @ApiOperation({ summary: 'Obtener KPIs del asesor autenticado' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial')
  getAdvisorStats(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getAdvisorStats(user);
  }

  @Get('portal-stats')
  @ApiOperation({ summary: 'Obtener KPIs del portal del productor autenticado' })
  @Roles('cliente')
  getPortalStats(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getPortalStats(user);
  }
}
