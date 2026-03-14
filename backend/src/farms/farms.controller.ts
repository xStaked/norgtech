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
import { CreateFarmDto } from './dto/create-farm.dto';
import { ListFarmsQueryDto } from './dto/list-farms-query.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { FarmsService } from './farms.service';

@ApiTags('Farms')
@ApiBearerAuth()
@Controller('farms')
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar granjas con filtros por organización' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'speciesType', required: false, enum: ['poultry', 'swine'] })
  @ApiQuery({ name: 'advisorId', required: false })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial', 'cliente')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListFarmsQueryDto,
  ) {
    return this.farmsService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Crear granja' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFarmDto) {
    return this.farmsService.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de la granja con historial de visitas' })
  @ApiParam({ name: 'id', description: 'ID de la granja' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial', 'cliente')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.farmsService.findOne(user, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar granja' })
  @ApiParam({ name: 'id', description: 'ID de la granja' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFarmDto,
  ) {
    return this.farmsService.update(user, id, dto);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Obtener métricas de la granja' })
  @ApiParam({ name: 'id', description: 'ID de la granja' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial', 'cliente')
  getStats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.farmsService.getStats(user, id);
  }
}
