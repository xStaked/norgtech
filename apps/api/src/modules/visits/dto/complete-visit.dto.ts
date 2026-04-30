import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class CompleteVisitDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  summary!: string;

  @IsOptional()
  @IsString()
  nextStep?: string;
}
