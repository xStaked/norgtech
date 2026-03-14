import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateOperatingUnitDto } from './dto/create-operating-unit.dto';
import { CreateProducerFarmDto } from './dto/create-producer-farm.dto';
import { ListProducerFarmsQueryDto } from './dto/list-producer-farms-query.dto';
import { ListProducerOperatingUnitsQueryDto } from './dto/list-producer-operating-units-query.dto';
import { UpdateOperatingUnitDto } from './dto/update-operating-unit.dto';
import { UpdateProducerFarmDto } from './dto/update-producer-farm.dto';
import { FarmsService } from './farms.service';

@ApiTags('Producer Portal Farms')
@ApiBearerAuth()
@Roles('cliente')
@Controller('portal')
export class PortalFarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Get('farms')
  @ApiOperation({ summary: 'Listar granjas del productor autenticado' })
  @ApiQuery({ name: 'speciesType', required: false, enum: ['poultry', 'swine'] })
  findProducerFarms(
    @CurrentUser() user: AuthUser,
    @Query() query: ListProducerFarmsQueryDto,
  ) {
    return this.farmsService.findProducerFarms(user, query);
  }

  @Post('farms')
  @ApiOperation({ summary: 'Crear granja propia del productor autenticado' })
  createProducerFarm(@CurrentUser() user: AuthUser, @Body() dto: CreateProducerFarmDto) {
    return this.farmsService.createProducerFarm(user, dto);
  }

  @Get('farms/:id')
  @ApiOperation({ summary: 'Obtener detalle de una granja del productor autenticado' })
  @ApiParam({ name: 'id', description: 'ID de la granja' })
  findProducerFarm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.farmsService.findProducerFarm(user, id);
  }

  @Put('farms/:id')
  @ApiOperation({ summary: 'Actualizar una granja propia del productor autenticado' })
  @ApiParam({ name: 'id', description: 'ID de la granja' })
  updateProducerFarm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProducerFarmDto,
  ) {
    return this.farmsService.updateProducerFarm(user, id, dto);
  }

  @Get('farms/:id/operating-units')
  @ApiOperation({ summary: 'Listar unidades operativas de una granja propia' })
  @ApiParam({ name: 'id', description: 'ID de la granja' })
  listProducerFarmOperatingUnits(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.farmsService.listProducerOperatingUnits(user, { farmId: id });
  }

  @Get('operating-units')
  @ApiOperation({ summary: 'Listar unidades operativas del productor autenticado' })
  @ApiQuery({ name: 'farmId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  findProducerOperatingUnits(
    @CurrentUser() user: AuthUser,
    @Query() query: ListProducerOperatingUnitsQueryDto,
  ) {
    return this.farmsService.listProducerOperatingUnits(user, query);
  }

  @Post('operating-units')
  @ApiOperation({ summary: 'Crear una unidad operativa dentro de una granja propia' })
  createProducerOperatingUnit(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOperatingUnitDto,
  ) {
    return this.farmsService.createProducerOperatingUnit(user, dto);
  }

  @Get('operating-units/:id')
  @ApiOperation({ summary: 'Obtener detalle de una unidad operativa propia' })
  @ApiParam({ name: 'id', description: 'ID de la unidad operativa' })
  findProducerOperatingUnit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.farmsService.findProducerOperatingUnit(user, id);
  }

  @Put('operating-units/:id')
  @ApiOperation({ summary: 'Actualizar una unidad operativa propia' })
  @ApiParam({ name: 'id', description: 'ID de la unidad operativa' })
  updateProducerOperatingUnit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOperatingUnitDto,
  ) {
    return this.farmsService.updateProducerOperatingUnit(user, id, dto);
  }
}
