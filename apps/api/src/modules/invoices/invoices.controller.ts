import {
  BadRequestException,
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
import {
  SUPPORT_FILE_ALLOWED_MIME_TYPES,
  SUPPORT_FILE_MAX_BYTES,
} from "../../shared/support-file.constants";
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

function assertPaymentSupportMimeType(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  if (
    !SUPPORT_FILE_ALLOWED_MIME_TYPES.includes(
      file.mimetype as (typeof SUPPORT_FILE_ALLOWED_MIME_TYPES)[number],
    )
  ) {
    callback(new BadRequestException("Unsupported payment support content type"), false);
    return;
  }
  callback(null, true);
}

function sanitizeDownloadFileName(fileName: string): string {
  const sanitized = fileName
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f && char !== "\"" && char !== "\\";
    })
    .join("")
    .trim();
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
      limits: { fileSize: SUPPORT_FILE_MAX_BYTES },
      // Misma allowlist que el servicio: un cliente que bypasee el filtro de
      // Multer (o un bypass de proxy) chocaria de nuevo con la validacion antes
      // del upload.
      fileFilter: assertPaymentSupportMimeType,
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
