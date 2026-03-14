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
import { AddCaseMessageDto } from './dto/add-case-message.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { ListCasesQueryDto, CASE_STATUSES } from './dto/list-cases-query.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { CasesService } from './cases.service';

@ApiTags('Cases')
@ApiBearerAuth()
@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar casos técnicos con filtros y paginación' })
  @ApiQuery({ name: 'status', required: false, enum: CASE_STATUSES })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial', 'cliente')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCasesQueryDto,
  ) {
    return this.casesService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Crear caso técnico' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCaseDto) {
    return this.casesService.create(user, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener conteos de casos por estado para dashboard' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial', 'cliente')
  getStats(@CurrentUser() user: AuthUser) {
    return this.casesService.getStats(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle del caso con timeline de mensajes' })
  @ApiParam({ name: 'id', description: 'ID del caso' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial', 'cliente')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casesService.findOne(user, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar caso técnico' })
  @ApiParam({ name: 'id', description: 'ID del caso' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCaseDto,
  ) {
    return this.casesService.update(user, id, dto);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Agregar nota o mensaje al timeline del caso' })
  @ApiParam({ name: 'id', description: 'ID del caso' })
  @Roles('admin', 'asesor_tecnico', 'asesor_comercial')
  addMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddCaseMessageDto,
  ) {
    return this.casesService.addMessage(user, id, dto);
  }
}
