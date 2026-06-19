import { PartialType } from "@nestjs/mapped-types";
import { CreateSellerGoalDto } from "./create-seller-goal.dto";

export class UpdateSellerGoalDto extends PartialType(CreateSellerGoalDto) {}
