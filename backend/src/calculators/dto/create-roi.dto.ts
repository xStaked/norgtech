import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsUUID, Max } from 'class-validator';

export class CreateRoiDto {
  @ApiPropertyOptional({
    description: 'Granja asociada para dar contexto al cálculo ROI',
  })
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiProperty({
    description: 'Ahorro esperado en alimento durante el ciclo',
    example: 1250,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  feedSavings!: number;

  @ApiProperty({
    description: 'Valor monetario de la mejora en ganancia de peso',
    example: 980,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  weightGainValue!: number;

  @ApiProperty({
    description: 'Costo total del aditivo o programa evaluado',
    example: 600,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  additiveCost!: number;
}
