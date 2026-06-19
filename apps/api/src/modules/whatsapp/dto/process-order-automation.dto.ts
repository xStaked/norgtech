import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class OrderAutomationItemDto {
  @IsString()
  @IsNotEmpty()
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
  @ArrayMinSize(1)
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
