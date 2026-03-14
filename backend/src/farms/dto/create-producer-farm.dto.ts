import { OmitType } from '@nestjs/swagger';
import { CreateFarmDto } from './create-farm.dto';

export class CreateProducerFarmDto extends OmitType(CreateFarmDto, ['clientId'] as const) {}
