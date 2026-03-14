import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateFarmDto } from './create-farm.dto';

export class UpdateProducerFarmDto extends PartialType(
  OmitType(CreateFarmDto, ['clientId'] as const),
) {}
