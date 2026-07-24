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

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

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
