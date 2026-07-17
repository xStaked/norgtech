import { OpportunityStage } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";

export class CreateOpportunityDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  title!: string;

  @IsEnum(OpportunityStage)
  stage!: OpportunityStage;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedValue?: number;

  // OPP-02: permite registrar el motivo cuando la oportunidad nace ya `perdida`
  // (el form de creacion es el unico punto de la UI que fija `stage`). Opcional
  // para no romper `createFromNora`, que solo pasa customerId/title/stage.
  @IsOptional()
  @IsString()
  lostReason?: string;
}
