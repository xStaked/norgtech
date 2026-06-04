import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { EXPENSE_SUPPORT_MAX_BYTES } from "./commercial-expense-constants";
import { CommercialExpensesService } from "./commercial-expenses.service";
import { CreateCommercialExpenseDto } from "./dto/create-commercial-expense.dto";
import { ListCommercialExpensesDto } from "./dto/list-commercial-expenses.dto";
import { UpdateCommercialExpenseStatusDto } from "./dto/update-commercial-expense-status.dto";
import { UpdateCommercialExpenseDto } from "./dto/update-commercial-expense.dto";

const expenseRoles = [
  "administrador",
  "director_comercial",
  "comercial",
  "facturacion",
] as const;

const validationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function sanitizeDownloadFileName(fileName: string): string {
  const sanitized = fileName.replace(/[\x00-\x1F\x7F"\\]/g, "").trim();
  return sanitized || "soporte";
}

@Controller("commercial-expenses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommercialExpensesController {
  constructor(
    private readonly commercialExpensesService: CommercialExpensesService,
  ) {}

  @Roles(...expenseRoles)
  @Post()
  @UseInterceptors(
    FileInterceptor("support", {
      storage: memoryStorage(),
      limits: { fileSize: EXPENSE_SUPPORT_MAX_BYTES },
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body(validationPipe) dto: CreateCommercialExpenseDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.commercialExpensesService.create(user, dto, file);
  }

  @Roles(...expenseRoles)
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query(validationPipe) filters: ListCommercialExpensesDto,
  ) {
    return this.commercialExpensesService.findAll(user, filters);
  }

  @Roles(...expenseRoles)
  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query(validationPipe) filters: ListCommercialExpensesDto,
  ) {
    return this.commercialExpensesService.summary(user, filters);
  }

  @Roles(...expenseRoles)
  @Get("export")
  async export(
    @CurrentUser() user: AuthUser,
    @Query(validationPipe) filters: ListCommercialExpensesDto,
    @Res() response: Response,
  ) {
    const rows = await this.commercialExpensesService.exportRows(user, filters);
    const exportService = this.commercialExpensesService.getExportService();

    if (filters.format === "xlsx") {
      const workbook = await exportService.generateXlsx(rows);
      response.setHeader("Content-Type", exportService.xlsxContentType);
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="gastos.xlsx"`,
      );
      response.send(workbook);
      return;
    }

    const csv = exportService.generateCsv(rows);
    response.setHeader("Content-Type", exportService.csvContentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="gastos.csv"`,
    );
    response.send(csv);
  }

  @Roles(...expenseRoles)
  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.commercialExpensesService.findOne(user, id);
  }

  @Roles(...expenseRoles)
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(validationPipe) dto: UpdateCommercialExpenseDto,
  ) {
    return this.commercialExpensesService.update(user, id, dto);
  }

  @Roles("administrador", "director_comercial", "facturacion")
  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(validationPipe) dto: UpdateCommercialExpenseStatusDto,
  ) {
    return this.commercialExpensesService.updateStatus(user, id, dto);
  }

  @Roles(...expenseRoles)
  @Get(":id/supports/:supportId")
  async getSupport(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("supportId") supportId: string,
    @Res() response: Response,
  ) {
    const support = await this.commercialExpensesService.getSupport(
      user,
      id,
      supportId,
    );

    response.setHeader("Content-Type", support.contentType);
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${sanitizeDownloadFileName(support.fileName)}"`,
    );
    support.stream.pipe(response);
  }
}
