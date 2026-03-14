import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SearchKnowledgeDto {
  @ApiProperty({
    description: 'Texto de búsqueda en la base de conocimiento',
    example: 'protocolos para bioseguridad en galpones',
  })
  @IsString()
  @MaxLength(160)
  query!: string;

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
    description: 'Filtrar por etiquetas',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Restringir a artículos publicados',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  publishedOnly?: boolean;
}
