import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const KNOWLEDGE_SPECIES_TYPES = ['both', 'poultry', 'swine'] as const;

export class CreateKnowledgeArticleDto {
  @ApiProperty({
    description: 'Título del artículo técnico',
    example: 'Manejo nutricional para lotes con estrés calórico',
  })
  @IsString()
  @MaxLength(180)
  title!: string;

  @ApiProperty({
    description: 'Contenido completo en markdown',
    example: '## Diagnóstico inicial\n\n1. Revisar consumo.\n2. Validar ventilación.',
  })
  @IsString()
  @MaxLength(30000)
  content!: string;

  @ApiProperty({
    description: 'Categoría operativa del artículo',
    example: 'nutricion',
  })
  @IsString()
  @MaxLength(80)
  category!: string;

  @ApiPropertyOptional({
    description: 'Especie aplicable',
    enum: KNOWLEDGE_SPECIES_TYPES,
    default: 'both',
  })
  @IsOptional()
  @IsString()
  @IsIn(KNOWLEDGE_SPECIES_TYPES)
  speciesType?: 'both' | 'poultry' | 'swine';

  @ApiPropertyOptional({
    description: 'Etiquetas del artículo',
    example: ['ventilacion', 'bioseguridad'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Indica si el artículo está visible para consultas',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
