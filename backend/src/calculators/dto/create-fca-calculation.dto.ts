import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const SPECIES_TYPES = ['poultry', 'swine'] as const;

export class CreateFcaCalculationDto {
  @ApiPropertyOptional({
    description: 'ID de la granja asociada al cálculo',
    example: '9b7b2d5e-7340-476f-a420-063c81ed9c27',
  })
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiProperty({
    description: 'Especie del lote o granja evaluada',
    enum: SPECIES_TYPES,
    example: 'poultry',
  })
  @IsIn(SPECIES_TYPES)
  speciesType!: (typeof SPECIES_TYPES)[number];

  @ApiProperty({
    description: 'Animales iniciales del lote',
    example: 12000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  birdCount!: number;

  @ApiProperty({
    description: 'Mortalidad acumulada del lote',
    example: 180,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mortalityCount!: number;

  @ApiProperty({
    description: 'Alimento consumido total del lote en kg',
    example: 22850,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  feedConsumedKg!: number;

  @ApiProperty({
    description: 'Peso promedio final del animal en kg',
    example: 2.36,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  birdWeightKg!: number;

  @ApiPropertyOptional({
    description: 'Peso inicial estimado por animal en kg',
    example: 0.04,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(5)
  initialWeightKg?: number;

  @ApiProperty({
    description: 'Costo del alimento por kg',
    example: 1900,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  feedCostPerKg!: number;

  @ApiPropertyOptional({
    description: 'Precio de mercado por kg para estimar pérdidas',
    example: 6200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  marketPricePerKg?: number;

  @ApiPropertyOptional({
    description: 'Benchmark objetivo de FCA; si no se envía se usa uno por especie',
    example: 1.68,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  benchmarkFca?: number;
}
