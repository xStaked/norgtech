import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { CreateSpecialPriceListItemDto } from "./create-special-price-list-item.dto";

export class CreateSpecialPriceListDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSpecialPriceListItemDto)
  items!: CreateSpecialPriceListItemDto[];
}
