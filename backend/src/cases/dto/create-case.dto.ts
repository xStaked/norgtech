import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const CASE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export class CreateCaseDto {
  @ApiProperty({
    description: 'ID del productor asociado al caso',
    example: '3c4e1e62-7684-4a35-a40d-3e20f1e9b787',
  })
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({
    description: 'ID de la granja asociada al caso',
    example: 'a67f9d40-04c8-4eeb-b659-9d7f3fa0ca9f',
  })
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiProperty({
    description: 'Título corto del caso técnico',
    example: 'Baja conversión alimenticia en lote 21',
  })
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({
    description: 'Descripción detallada del caso',
    example: 'Se evidencia aumento de mortalidad y caída de consumo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({
    enum: CASE_SEVERITIES,
    description: 'Nivel de severidad del caso',
  })
  @IsString()
  @IsIn(CASE_SEVERITIES)
  severity!: 'low' | 'medium' | 'high' | 'critical';

  @ApiPropertyOptional({
    description: 'ID del asesor técnico asignado',
    example: 'c080a6c4-301e-4521-bf01-5d2a7f3e6b3b',
  })
  @IsOptional()
  @IsUUID()
  assignedTechId?: string;
}
