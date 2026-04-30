import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { GenerateReportDto } from "./dto/generate-report.dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "tecnico")
  @Post("from-visit/:visitId")
  generateFromVisit(
    @CurrentUser() user: AuthUser,
    @Param("visitId") visitId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    _dto: GenerateReportDto,
  ) {
    return this.reportsService.generateFromVisit(visitId, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "tecnico")
  @Get()
  findAll(
    @Query("customerId") customerId?: string,
    @Query("visitId") visitId?: string,
    @Query("createdBy") createdBy?: string,
  ) {
    return this.reportsService.findAll({ customerId, visitId, createdBy });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "tecnico")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.reportsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "tecnico")
  @Get(":id/pdf")
  async downloadPdf(@Param("id") id: string, @Res() res: Response) {
    const pdfBuffer = await this.reportsService.generatePdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="reporte-${id}.pdf"`);
    res.send(pdfBuffer);
  }
}
