import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVisitDto {
  @ApiPropertyOptional({
    description: 'ID del caso técnico relacionado con la visita',
    example: 'f8d5bb14-8f4a-4f16-bc0b-d0ec7a0e19ff',
  })
  @IsOptional()
  @IsUUID()
  caseId?: string;

  @ApiProperty({
    description: 'ID del productor visitado',
    example: '3c4e1e62-7684-4a35-a40d-3e20f1e9b787',
  })
  @IsUUID()
  clientId!: string;

  @ApiProperty({
    description: 'ID de la granja visitada',
    example: '1dbe0fbf-4fdf-4622-8b45-2ee7340ed113',
  })
  @IsUUID()
  farmId!: string;

  @ApiProperty({
    description: 'ID del asesor que realiza la visita',
    example: 'bce516a7-4105-428f-8f92-7d709ebdc9b8',
  })
  @IsUUID()
  advisorId!: string;

  @ApiProperty({
    description: 'Fecha de ejecución de la visita',
    example: '2026-03-12T14:30:00.000Z',
  })
  @IsDateString()
  visitDate!: string;

  @ApiPropertyOptional({ description: 'Cantidad de aves evaluadas', example: 12000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  birdCount?: number;

  @ApiPropertyOptional({ description: 'Cantidad de mortalidad registrada', example: 135 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mortalityCount?: number;

  @ApiPropertyOptional({ description: 'Conversión alimenticia registrada', example: 1.72 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  feedConversion?: number;

  @ApiPropertyOptional({ description: 'Peso corporal promedio en kg', example: 2.31 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  avgBodyWeight?: number;

  @ApiPropertyOptional({ description: 'Cantidad de animales evaluados', example: 820 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  animalCount?: number;

  @ApiPropertyOptional({ description: 'Ganancia diaria de peso en kg', example: 0.86 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dailyWeightGain?: number;

  @ApiPropertyOptional({ description: 'Consumo de alimento en kg', example: 2.1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  feedConsumption?: number;

  @ApiPropertyOptional({
    description: 'Observaciones técnicas de la visita',
    example: 'Se evidencia mejora en ventilación y uniformidad del lote.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observations?: string;

  @ApiPropertyOptional({
    description: 'Recomendaciones entregadas durante la visita',
    example: 'Ajustar densidad y reforzar protocolo sanitario en la línea 3.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  recommendations?: string;
}
