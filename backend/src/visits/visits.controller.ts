import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateVisitDto } from './dto/create-visit.dto';
import { ListVisitsQueryDto } from './dto/list-visits-query.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { VisitsService } from './visits.service';

@ApiTags('Visits')
@ApiBearerAuth()
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar visitas técnicas con filtros por organización' })
  @ApiQuery({ name: 'advisorId', required: false })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'farmId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial', 'cliente')
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListVisitsQueryDto) {
    return this.visitsService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar visita técnica de campo' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVisitDto) {
    return this.visitsService.create(user, dto);
  }

  @Get('farm/:farmId')
  @ApiOperation({ summary: 'Obtener historial de visitas de una granja' })
  @ApiParam({ name: 'farmId', description: 'ID de la granja' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial', 'cliente')
  findByFarm(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.visitsService.findByFarm(user, farmId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una visita técnica' })
  @ApiParam({ name: 'id', description: 'ID de la visita' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial', 'cliente')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.visitsService.findOne(user, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar visita técnica' })
  @ApiParam({ name: 'id', description: 'ID de la visita' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateVisitDto,
  ) {
    return this.visitsService.update(user, id, dto);
  }
}
