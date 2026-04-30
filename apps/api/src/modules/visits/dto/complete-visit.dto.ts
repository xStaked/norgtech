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
  diagnosis?: string;

  @IsOptional()
  @IsString()
  problems?: string;

  @IsOptional()
  @IsString()
  proposedSolution?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  nextStep?: string;
}
