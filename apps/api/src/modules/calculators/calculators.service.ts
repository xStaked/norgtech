import { Injectable } from "@nestjs/common";

export interface RoiInputs {
  investment: number;
  annualSavings: number;
  annualRevenueIncrease?: number;
}

export interface RoiResult {
  roi: number;
  roiPercentage: number;
  paybackPeriod: number;
  annualSavings: number;
  totalAnnualBenefit: number;
  investment: number;
}

export interface CostInputs {
  unitCost: number;
  quantity: number;
  installationCost?: number;
  maintenanceAnnual?: number;
}

export interface CostResult {
  productCost: number;
  installationCost: number;
  maintenanceAnnual: number;
  firstYearTotal: number;
  breakdown: Array<{ label: string; value: number }>;
}

@Injectable()
export class CalculatorsService {
  calculateROI(inputs: RoiInputs): RoiResult {
    const investment = inputs.investment;
    const annualSavings = inputs.annualSavings;
    const annualRevenueIncrease = inputs.annualRevenueIncrease ?? 0;
    const totalAnnualBenefit = annualSavings + annualRevenueIncrease;

    const roi = totalAnnualBenefit - investment;
    const roiPercentage = investment > 0 ? (roi / investment) * 100 : 0;
    const paybackPeriod = totalAnnualBenefit > 0 ? investment / totalAnnualBenefit : 0;

    return {
      roi: Math.round(roi * 100) / 100,
      roiPercentage: Math.round(roiPercentage * 100) / 100,
      paybackPeriod: Math.round(paybackPeriod * 100) / 100,
      annualSavings: Math.round(annualSavings * 100) / 100,
      totalAnnualBenefit: Math.round(totalAnnualBenefit * 100) / 100,
      investment: Math.round(investment * 100) / 100,
    };
  }

  calculateCosts(inputs: CostInputs): CostResult {
    const productCost = inputs.unitCost * inputs.quantity;
    const installationCost = inputs.installationCost ?? 0;
    const maintenanceAnnual = inputs.maintenanceAnnual ?? 0;
    const firstYearTotal = productCost + installationCost + maintenanceAnnual;

    return {
      productCost: Math.round(productCost * 100) / 100,
      installationCost: Math.round(installationCost * 100) / 100,
      maintenanceAnnual: Math.round(maintenanceAnnual * 100) / 100,
      firstYearTotal: Math.round(firstYearTotal * 100) / 100,
      breakdown: [
        { label: "Producto", value: Math.round(productCost * 100) / 100 },
        { label: "Instalación", value: Math.round(installationCost * 100) / 100 },
        { label: "Mantenimiento anual", value: Math.round(maintenanceAnnual * 100) / 100 },
      ],
    };
  }
}
