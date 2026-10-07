import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { CreateSpecialPriceListItemDto } from "./create-special-price-list-item.dto";

export class UpdateSpecialPriceListRevisionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSpecialPriceListItemDto)
  items!: CreateSpecialPriceListItemDto[];
}
