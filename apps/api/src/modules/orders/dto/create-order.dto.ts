import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { CreateOrderItemDto } from "./create-order-item.dto";

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsOptional()
  @IsString()
  opportunityId?: string;

  @IsOptional()
  @IsString()
  sourceQuoteId?: string;

  @IsOptional()
  @IsString()
  requestedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
