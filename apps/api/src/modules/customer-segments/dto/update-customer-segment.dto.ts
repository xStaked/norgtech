import { PartialType } from "@nestjs/mapped-types";
import { CreateCustomerSegmentDto } from "./create-customer-segment.dto";

export class UpdateCustomerSegmentDto extends PartialType(
  CreateCustomerSegmentDto,
) {}
