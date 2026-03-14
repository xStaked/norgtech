import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { FARM_SPECIES } from './create-farm.dto';

export class ListProducerFarmsQueryDto {
  @ApiPropertyOptional({
    enum: FARM_SPECIES,
    description: 'Filtrar por especie principal',
  })
  @IsOptional()
  @IsIn(FARM_SPECIES)
  speciesType?: 'poultry' | 'swine';
}
