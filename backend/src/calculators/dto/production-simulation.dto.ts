import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from 'class-validator';

export const PRODUCTION_PROGRAMS = ['broiler', 'layer', 'swine'] as const;
export type ProductionProgram = (typeof PRODUCTION_PROGRAMS)[number];

export class ProductionSimulationDto {
  @ApiProperty({
    enum: PRODUCTION_PROGRAMS,
    description: 'Programa productivo a simular',
  })
  @IsIn(PRODUCTION_PROGRAMS)
  programType!: ProductionProgram;

  @ApiPropertyOptional({
    description: 'Identificador de granja referencial para el frontend',
  })
  @IsOptional()
  farmId?: string;

  @ApiProperty({ description: 'Número de animales al inicio del ciclo', example: 12000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  initialAnimalCount!: number;

  @ApiProperty({ description: 'Peso inicial promedio en kg', example: 0.045 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  startingWeightKg!: number;

  @ApiProperty({ description: 'Peso objetivo promedio en kg', example: 2.4 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  targetWeightKg!: number;

  @ApiProperty({ description: 'Duración del ciclo en semanas', example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(104)
  cycleWeeks!: number;

  @ApiProperty({ description: 'Mortalidad semanal esperada (%)', example: 0.7 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weeklyMortalityRatePct!: number;

  @ApiProperty({ description: 'Conversión alimenticia proyectada', example: 1.62 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  feedConversionRate!: number;

  @ApiProperty({ description: 'Costo del alimento por kg', example: 0.48 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  feedCostPerKg!: number;

  @ApiProperty({ description: 'Precio de venta por kg vivo', example: 1.45 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePricePerKg!: number;
}
