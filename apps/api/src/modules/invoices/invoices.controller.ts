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
import { InvoicesService } from "./invoices.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { ListInvoicesDto } from "./dto/list-invoices.dto";
import { UpdateInvoiceStatusDto } from "./dto/update-invoice-status.dto";
import { CreatePaymentDto } from "./dto/create-payment.dto";

const invoiceRoles = [
  "administrador",
  "director_comercial",
  "facturacion",
  "comercial",
] as const;

const controlRoles = [
  "administrador",
  "director_comercial",
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

@Controller("invoices")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Roles(...controlRoles)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(validationPipe) dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(user, dto);
  }

  @Roles(...invoiceRoles)
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query(validationPipe) filters: ListInvoicesDto,
  ) {
    return this.invoicesService.findAll(user, filters);
  }

  @Roles(...invoiceRoles)
  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query(validationPipe) filters: ListInvoicesDto,
  ) {
    return this.invoicesService.getSummary(user, filters);
  }

  @Roles(...invoiceRoles)
  @Get("overdue")
  overdue(@CurrentUser() user: AuthUser) {
    return this.invoicesService.getOverdueInvoices(user);
  }

  @Roles(...invoiceRoles)
  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.invoicesService.findOne(user, id);
  }

  @Roles(...controlRoles)
  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(validationPipe) dto: UpdateInvoiceStatusDto,
  ) {
    return this.invoicesService.updateStatus(user, id, dto);
  }

  @Roles(...controlRoles)
  @Post("payments")
  @UseInterceptors(
    FileInterceptor("support", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  createPayment(
    @CurrentUser() user: AuthUser,
    @Body(validationPipe) dto: CreatePaymentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.invoicesService.createPayment(user, dto, file);
  }

  @Roles(...invoiceRoles)
  @Get(":id/payments")
  findPayments(
    @CurrentUser() user: AuthUser,
    @Param("id") invoiceId: string,
  ) {
    return this.invoicesService.findPayments(user, invoiceId);
  }

  @Roles(...invoiceRoles)
  @Get("payments/:paymentId/supports/:supportId")
  async getSupport(
    @CurrentUser() user: AuthUser,
    @Param("paymentId") paymentId: string,
    @Param("supportId") supportId: string,
    @Res() response: Response,
  ) {
    const { support, stream } = await this.invoicesService.getPaymentSupport(
      user,
      paymentId,
      supportId,
    );

    response.setHeader("Content-Type", support.contentType);
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${sanitizeDownloadFileName(support.fileName)}"`,
    );
    stream.pipe(response);
  }
}
