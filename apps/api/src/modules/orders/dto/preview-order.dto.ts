import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNotEmpty, IsString, ValidateNested } from "class-validator";
import { CreateOrderItemDto } from "./create-order-item.dto";

export class PreviewOrderDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
