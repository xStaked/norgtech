export class PurchaseProgressDto {
  currentMonthSales!: number;
  budget!: number | null;
  percent!: number | null;
}

export class CreditSummaryDto {
  creditLimit!: number | null;
  purchaseBudget!: number | null;
  currentBalance!: number;
  availableCredit!: number | null;
  utilizationPercent!: number | null;
  isNearLimit!: boolean;
  purchaseProgress!: PurchaseProgressDto;
}
