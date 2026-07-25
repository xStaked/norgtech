import { IsOptional, IsString, MaxLength } from "class-validator";
import { IncludeInactiveQueryDto } from "../../../common/dto/include-inactive.query";

export class ListProductsQueryDto extends IncludeInactiveQueryDto {
  /**
   * Deja solo los productos que este cliente puede comprar: los que tienen
   * precio en su lista. Sin lista asignada, el catalogo sale vacio.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerId?: string;
}
