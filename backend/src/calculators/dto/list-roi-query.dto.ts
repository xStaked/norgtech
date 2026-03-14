import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListRoiQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar historial ROI por granja' })
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiPropertyOptional({ description: 'Máximo de registros a devolver', default: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 12;
}
