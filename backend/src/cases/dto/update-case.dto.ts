import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CreateCaseDto } from './create-case.dto';
import { CASE_STATUSES } from './list-cases-query.dto';

export class UpdateCaseDto extends PartialType(CreateCaseDto) {
  @ApiPropertyOptional({
    enum: CASE_STATUSES,
    description: 'Nuevo estado del caso técnico',
  })
  @IsOptional()
  @IsString()
  @IsIn(CASE_STATUSES)
  status?: (typeof CASE_STATUSES)[number];
}
