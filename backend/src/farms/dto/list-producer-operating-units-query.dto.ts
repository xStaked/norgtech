import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { OPERATING_UNIT_STATUSES } from './create-operating-unit.dto';

export class ListProducerOperatingUnitsQueryDto {
  @ApiPropertyOptional({
    description: 'Filtrar por granja padre',
    example: '3c4e1e62-7684-4a35-a40d-3e20f1e9b787',
  })
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiPropertyOptional({
    enum: OPERATING_UNIT_STATUSES,
    description: 'Filtrar por estado',
  })
  @IsOptional()
  @IsIn(OPERATING_UNIT_STATUSES)
  status?: 'active' | 'inactive';
}
