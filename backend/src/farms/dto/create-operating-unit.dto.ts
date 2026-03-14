import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const OPERATING_UNIT_STATUSES = ['active', 'inactive'] as const;

export class CreateOperatingUnitDto {
  @ApiProperty({
    description: 'ID de la granja padre',
    example: '3c4e1e62-7684-4a35-a40d-3e20f1e9b787',
  })
  @IsUUID()
  farmId!: string;

  @ApiProperty({
    description: 'Nombre interno único dentro de la granja',
    example: 'galpon-01',
  })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description: 'Nombre visible para el productor',
    example: 'Galpón 01',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Tipo de unidad operativa',
    example: 'galpon',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  unitType?: string;

  @ApiPropertyOptional({
    description: 'Capacidad instalada de la unidad operativa',
    example: 1200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    enum: OPERATING_UNIT_STATUSES,
    description: 'Estado operativo de la unidad',
  })
  @IsOptional()
  @IsIn(OPERATING_UNIT_STATUSES)
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({
    description: 'Metadatos opcionales de la unidad',
    example: { stage: 'engorde' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
