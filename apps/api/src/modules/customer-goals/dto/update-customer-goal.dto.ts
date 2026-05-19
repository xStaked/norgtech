import { PartialType } from "@nestjs/mapped-types";
import { CreateCustomerGoalDto } from "./create-customer-goal.dto";

export class UpdateCustomerGoalDto extends PartialType(CreateCustomerGoalDto) {}
