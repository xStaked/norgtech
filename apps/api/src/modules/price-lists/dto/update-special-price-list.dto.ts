import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class UpdateSpecialPriceListDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
