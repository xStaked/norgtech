import { OmitType, PartialType } from "@nestjs/mapped-types";
import { CreateProductDto } from "./create-product.dto";

/**
 * El SKU no se edita: es la llave natural con la que el import del catálogo
 * hace upsert, y cambiarlo duplicaría el producto en la siguiente corrida.
 * Las presentaciones tampoco se tocan aquí, tienen sus propios endpoints.
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ["sku", "presentations"] as const),
) {}
