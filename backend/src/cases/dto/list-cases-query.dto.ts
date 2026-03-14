import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { CASE_SEVERITIES } from './create-case.dto';

export const CASE_STATUSES = [
  'open',
  'in_analysis',
  'treatment',
  'waiting_client',
  'closed',
] as const;

const normalizeString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class ListCasesQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({ enum: CASE_STATUSES })
  @Transform(normalizeString)
  @IsOptional()
  @IsIn(CASE_STATUSES)
  status?: (typeof CASE_STATUSES)[number];

  @ApiPropertyOptional({ enum: CASE_SEVERITIES })
  @Transform(normalizeString)
  @IsOptional()
  @IsIn(CASE_SEVERITIES)
  severity?: (typeof CASE_SEVERITIES)[number];

  @ApiPropertyOptional({ description: 'Filtrar por técnico asignado' })
  @IsOptional()
  @IsUUID()
  assignedTechId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por productor' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por granja' })
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiPropertyOptional({ description: 'Buscar por título o descripción' })
  @Transform(normalizeString)
  @IsOptional()
  @IsString()
  search?: string;
}
