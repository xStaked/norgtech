import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class CompleteVisitDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  summary?: string;

  @IsOptional()
  @IsString()
  nextStep?: string;
}
