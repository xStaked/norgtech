import { Body, Controller, Get, Param, Patch, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ZonesService } from "./zones.service";
import { CreateZoneDto } from "./dto/create-zone.dto";
import { UpdateZoneDto } from "./dto/update-zone.dto";

@Controller("zones")
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador")
  @Post()
  create(@Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: CreateZoneDto) {
    return this.zonesService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Get()
  findAll() {
    return this.zonesService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.zonesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador")
  @Patch(":id")
  update(@Param("id") id: string, @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: UpdateZoneDto) {
    return this.zonesService.update(id, dto);
  }
}
