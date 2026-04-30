import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

function parseBooleanQueryValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return value;
}

export class QuerySessionDto {
  @IsOptional()
  @Transform(({ value }) => parseBooleanQueryValue(value))
  @IsBoolean()
  includeMessages?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseBooleanQueryValue(value))
  @IsBoolean()
  includeProposals?: boolean;
}
