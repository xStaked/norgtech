import { Type } from "class-transformer";
import { IsIn, IsNumber, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateCommissionRuleDto {
  @IsString()
  sellerUserId!: string;

  @IsIn(["mensual", "trimestral", "anual"])
  periodType!: string;

  @IsString()
  @MaxLength(7)
  periodValue!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  percent!: number;
}
