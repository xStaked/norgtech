import { IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class ResolveOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  /**
   * Aceptado pero IGNORADO para tarifar. La linea resuelta se valora desde
   * product.basePrice mas el descuento de segmento condicionado a la meta,
   * exactamente como orders.service.create() ignora
   * CreateOrderItemDto.unitPrice en las lineas de catalogo.
   *
   * Se mantiene REQUERIDO a proposito: es el mismo contrato que ya tiene
   * CreateOrderItemDto.unitPrice, y volverlo opcional seria un cambio de
   * contrato sin necesidad. El valor sirve como intencion del operador para
   * la auditoria, no como precio.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}
