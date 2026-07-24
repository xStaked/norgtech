import { Type } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { CustomerType, PaymentCondition } from "@prisma/client";

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  country?: string;

  /** Lista de precios negociada. Si la tiene, gana sobre el precio base. */
  @IsOptional()
  @IsString()
  priceListId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  segmentId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  companyId?: string;

  /**
   * Vendedor. `null` lo deja sin vendedor: cuando alguien sale de la empresa
   * su cartera queda huérfana hasta que la reasignen. El servicio ya distingue
   * null de undefined (undefined = no lo toques), así que el tipo solo lo hace
   * explícito.
   */
  @IsOptional()
  @IsString()
  assignedToUserId?: string | null;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsEnum(PaymentCondition)
  paymentCondition?: PaymentCondition;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paymentDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchaseBudget?: number;
}
