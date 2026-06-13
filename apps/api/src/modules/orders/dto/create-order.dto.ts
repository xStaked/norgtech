import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { CreateOrderItemDto } from "./create-order-item.dto";

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsOptional()
  @IsString()
  opportunityId?: string;

  @IsOptional()
  @IsString()
  sourceQuoteId?: string;

  @IsOptional()
  @IsString()
  sourceConversationId?: string;

  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsOptional()
  @IsString()
  purchaseOrderNumber?: string;

  @IsOptional()
  @IsString()
  orderDate?: string;

  @IsOptional()
  @IsString()
  billingCompanyNameSnapshot?: string;

  @IsOptional()
  @IsString()
  branchNameSnapshot?: string;

  @IsOptional()
  @IsString()
  dispatchAddressSnapshot?: string;

  @IsOptional()
  @IsString()
  requesterName?: string;

  @IsOptional()
  @IsEmail()
  requesterEmail?: string;

  @IsOptional()
  @IsString()
  requesterRole?: string;

  @IsOptional()
  @IsString()
  requesterPhone?: string;

  @IsOptional()
  @IsString()
  approvedQuoteConsecutive?: string;

  @IsOptional()
  @IsString()
  deliveryInstructions?: string;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @IsEmail()
  receiverEmail?: string;

  @IsOptional()
  @IsString()
  receiverPhone?: string;

  @IsOptional()
  @IsString()
  receiverRole?: string;

  @IsOptional()
  @IsString()
  invoiceFilingPlace?: string;

  @IsOptional()
  @IsString()
  approvalStatus?: string;

  @IsOptional()
  @IsString()
  approvalReason?: string;

  @IsOptional()
  @IsString()
  approvalName?: string;

  @IsOptional()
  @IsString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  preparedByName?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  preparedByRole?: string;

  @IsOptional()
  @IsString()
  requestedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  assignedLogisticsUserId?: string;

  @IsOptional()
  @IsString()
  committedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  logisticsNotes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
