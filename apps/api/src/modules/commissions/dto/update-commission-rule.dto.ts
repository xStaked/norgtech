import { OmitType, PartialType } from "@nestjs/mapped-types";
import { CreateCommissionRuleDto } from "./create-commission-rule.dto";

export class UpdateCommissionRuleDto extends PartialType(
  OmitType(CreateCommissionRuleDto, ["sellerUserId"] as const),
) {}
