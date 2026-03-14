import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ListVisitsQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por asesor responsable' })
  @IsOptional()
  @IsUUID()
  advisorId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por productor' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por granja' })
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiPropertyOptional({ description: 'Fecha inicial del rango' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Fecha final del rango' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
