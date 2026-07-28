import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, ValidationPipe } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ROLE_GROUPS } from "../auth/permissions";
import { IncludeInactiveQueryDto } from "../../common/dto/include-inactive.query";
import { ZonesService } from "./zones.service";
import { CreateZoneDto } from "./dto/create-zone.dto";
import { UpdateZoneDto } from "./dto/update-zone.dto";

const listQueryPipe = new ValidationPipe({ transform: true, whitelist: true });

@Controller("zones")
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLE_GROUPS.ADMIN_AND_DIRECTOR)
  @Post()
  create(@Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: CreateZoneDto) {
    return this.zonesService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  // El comercial entra por la barra de filtros de analitica: sin esto el select
  // de zona le llega vacio (403). Es solo el listado de nombres, no expone
  // cifras de nadie; crear y editar zonas sigue siendo de direccion.
  @Roles("administrador", "director_comercial", "comercial")
  @Get()
  findAll(@Query(listQueryPipe) query: IncludeInactiveQueryDto) {
    return this.zonesService.findAll(query.includeInactive);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.zonesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLE_GROUPS.ADMIN_AND_DIRECTOR)
  @Patch(":id")
  update(@Param("id") id: string, @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: UpdateZoneDto) {
    return this.zonesService.update(id, dto);
  }
}
