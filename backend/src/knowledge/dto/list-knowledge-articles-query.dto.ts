import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListKnowledgeArticlesQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por categoría' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ description: 'Filtrar por especie' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  speciesType?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tags separados por coma',
    example: 'bioseguridad,ventilacion',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tags?: string;

  @ApiPropertyOptional({ description: 'Búsqueda libre en título y contenido' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estado de publicación' })
  @IsOptional()
  @IsBooleanString()
  isPublished?: string;

  @ApiPropertyOptional({ description: 'Página actual', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Cantidad de resultados por página', default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
