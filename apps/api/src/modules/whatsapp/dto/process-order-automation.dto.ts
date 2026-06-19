import { Type } from "class-transformer";
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class OrderAutomationItemDto {
  @IsString()
  productRef!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsString()
  presentation?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ProcessOrderAutomationDto {
  @IsOptional()
  @IsString()
  companyRef?: string;

  @IsOptional()
  @IsString()
  customerZoneId?: string;

  @IsOptional()
  @IsString()
  zoneRef?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderAutomationItemDto)
  items!: OrderAutomationItemDto[];

  @IsOptional()
  @IsString()
  deliveryInstructions?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
