import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFcaCalculationDto } from './dto/create-fca-calculation.dto';
import { CreateRoiDto } from './dto/create-roi.dto';
import { ListRoiQueryDto } from './dto/list-roi-query.dto';
import {
  ProductionProgram,
  ProductionSimulationDto,
} from './dto/production-simulation.dto';

const FCA_BENCHMARKS = {
  poultry: 1.68,
  swine: 2.65,
} as const;

type FcaWithFarm = Prisma.FcaCalculationGetPayload<{
  include: {
    farm: {
      select: {
        id: true;
        name: true;
        speciesType: true;
        client: {
          select: {
            id: true;
            fullName: true;
            companyName: true;
          };
        };
      };
    };
  };
}>;

type RoiWithFarm = Prisma.RoiCalculationGetPayload<{
  include: {
    farm: {
      select: {
        id: true;
        name: true;
        speciesType: true;
        client: {
          select: {
            id: true;
            fullName: true;
            companyName: true;
          };
        };
      };
    };
  };
}>;

type ProgramProfile = {
  label: string;
  growthExponent: number;
  feedAdjustment: number;
  mortalityAdjustment: number;
};

const PROGRAM_PROFILES: Record<ProductionProgram, ProgramProfile> = {
  broiler: {
    label: 'Broiler',
    growthExponent: 0.86,
    feedAdjustment: 1,
    mortalityAdjustment: 1,
  },
  layer: {
    label: 'Ponedora',
    growthExponent: 0.7,
    feedAdjustment: 0.92,
    mortalityAdjustment: 0.82,
  },
  swine: {
    label: 'Cerdo',
    growthExponent: 1.08,
    feedAdjustment: 1.12,
    mortalityAdjustment: 0.9,
  },
};

@Injectable()
export class CalculatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async createFcaCalculation(user: AuthUser, dto: CreateFcaCalculationDto) {
    const organizationId = this.requireOrganizationId(user);
    const farm = dto.farmId
      ? await this.ensureFarmBelongsToOrganization(dto.farmId, organizationId)
      : null;
    const speciesType = (farm?.speciesType ?? dto.speciesType) as 'poultry' | 'swine';

    if (farm && farm.speciesType !== dto.speciesType) {
      throw new BadRequestException(
        'La especie enviada no coincide con la especie configurada en la granja.',
      );
    }

    if (dto.mortalityCount >= dto.birdCount) {
      throw new BadRequestException(
        'La mortalidad no puede ser igual o superior al total de animales del lote.',
      );
    }

    const initialWeightKg = dto.initialWeightKg ?? this.defaultInitialWeight(speciesType);
    const aliveBirds = dto.birdCount - dto.mortalityCount;
    const finalBiomassKg = aliveBirds * dto.birdWeightKg;
    const initialBiomassKg = dto.birdCount * initialWeightKg;
    const totalWeightGainKg = finalBiomassKg - initialBiomassKg;

    if (totalWeightGainKg <= 0) {
      throw new BadRequestException(
        'La ganancia de peso calculada debe ser mayor a cero. Revisa peso inicial y peso promedio.',
      );
    }

    const benchmarkFca = dto.benchmarkFca ?? FCA_BENCHMARKS[speciesType];
    const fcaResult = dto.feedConsumedKg / totalWeightGainKg;
    const productionCost = (dto.feedConsumedKg * dto.feedCostPerKg) / finalBiomassKg;
    const estimatedLosses =
      dto.mortalityCount * dto.birdWeightKg * (dto.marketPricePerKg ?? 0);
    const potentialSavings =
      Math.max(0, fcaResult - benchmarkFca) * totalWeightGainKg * dto.feedCostPerKg;

    const created = await this.prisma.fcaCalculation.create({
      data: {
        userId: user.id,
        organizationId,
        farmId: dto.farmId ?? null,
        feedConsumedKg: this.round(dto.feedConsumedKg),
        birdWeightKg: this.round(dto.birdWeightKg, 3),
        mortalityCount: dto.mortalityCount,
        birdCount: dto.birdCount,
        feedCostPerKg: this.round(dto.feedCostPerKg),
        fcaResult: this.round(fcaResult, 4),
        productionCost: this.round(productionCost),
        estimatedLosses: this.round(estimatedLosses),
        potentialSavings: this.round(potentialSavings),
      },
      include: this.fcaInclude(),
    });

    return this.serializeFcaCalculation(created, {
      speciesType,
      benchmarkFca,
      initialWeightKg,
      marketPricePerKg: dto.marketPricePerKg ?? 0,
    });
  }

  async getFcaHistory(user: AuthUser) {
    const organizationId = this.requireOrganizationId(user);
    const items = await this.prisma.fcaCalculation.findMany({
      where: {
        organizationId,
        userId: user.id,
      },
      include: this.fcaInclude(),
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
    });

    return {
      items: items.map((item) => this.serializeFcaCalculation(item)),
      meta: {
        total: items.length,
      },
    };
  }

  async createRoiCalculation(user: AuthUser, dto: CreateRoiDto) {
    const organizationId = this.requireOrganizationId(user);

    if (dto.farmId) {
      await this.ensureFarmBelongsToOrganization(dto.farmId, organizationId);
    }

    const totalBenefits = dto.feedSavings + dto.weightGainValue;
    if (totalBenefits <= 0) {
      throw new BadRequestException(
        'La suma entre ahorro alimenticio y valor de ganancia debe ser mayor a cero.',
      );
    }

    const netValue = totalBenefits - dto.additiveCost;
    const roiPercentage = (netValue / dto.additiveCost) * 100;
    const breakEven = (dto.additiveCost / totalBenefits) * 100;

    const created = await this.prisma.roiCalculation.create({
      data: {
        userId: user.id,
        organizationId,
        farmId: dto.farmId ?? null,
        feedSavings: this.round(dto.feedSavings),
        weightGainValue: this.round(dto.weightGainValue),
        additiveCost: this.round(dto.additiveCost),
        netValue: this.round(netValue),
        roiPercentage: this.round(roiPercentage),
        breakEven: this.round(breakEven),
      },
      include: this.roiInclude(),
    });

    return this.serializeRoiCalculation(created);
  }

  async getRoiHistory(user: AuthUser, query: ListRoiQueryDto) {
    const organizationId = this.requireOrganizationId(user);

    if (query.farmId) {
      await this.ensureFarmBelongsToOrganization(query.farmId, organizationId);
    }

    const limit = query.limit ?? 12;
    const items = await this.prisma.roiCalculation.findMany({
      where: {
        organizationId,
        userId: user.id,
        ...(query.farmId ? { farmId: query.farmId } : {}),
      },
      include: this.roiInclude(),
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    return {
      items: items.map((item) => this.serializeRoiCalculation(item)),
      meta: {
        total: items.length,
        limit,
        filters: query,
      },
    };
  }

  runProductionSimulation(dto: ProductionSimulationDto) {
    const profile = PROGRAM_PROFILES[dto.programType];

    if (dto.targetWeightKg <= dto.startingWeightKg) {
      throw new BadRequestException(
        'El peso objetivo debe ser mayor al peso inicial para generar una curva válida.',
      );
    }

    const weeklyMortalityRate =
      (dto.weeklyMortalityRatePct / 100) * profile.mortalityAdjustment;
    const weeklyProjection = [];

    let animalsAlive = dto.initialAnimalCount;
    let previousBiomassKg = animalsAlive * dto.startingWeightKg;
    let cumulativeFeedKg = 0;
    let cumulativeFeedCost = 0;

    for (let week = 1; week <= dto.cycleWeeks; week += 1) {
      animalsAlive = Math.max(0, animalsAlive * (1 - weeklyMortalityRate));

      const progress = week / dto.cycleWeeks;
      const growthFactor = Math.pow(progress, profile.growthExponent);
      const avgWeightKg =
        dto.startingWeightKg +
        (dto.targetWeightKg - dto.startingWeightKg) * growthFactor;
      const biomassKg = animalsAlive * avgWeightKg;
      const weeklyBiomassGainKg = Math.max(0, biomassKg - previousBiomassKg);
      const weeklyFeedKg =
        weeklyBiomassGainKg * dto.feedConversionRate * profile.feedAdjustment;
      const weeklyFeedCost = weeklyFeedKg * dto.feedCostPerKg;

      cumulativeFeedKg += weeklyFeedKg;
      cumulativeFeedCost += weeklyFeedCost;
      previousBiomassKg = biomassKg;

      const projectedRevenue = biomassKg * dto.salePricePerKg;
      const projectedMargin = projectedRevenue - cumulativeFeedCost;

      weeklyProjection.push({
        week,
        animalsAlive: this.round(animalsAlive, 0),
        avgWeightKg: this.round(avgWeightKg),
        biomassKg: this.round(biomassKg),
        weeklyFeedKg: this.round(weeklyFeedKg),
        cumulativeFeedKg: this.round(cumulativeFeedKg),
        cumulativeFeedCost: this.round(cumulativeFeedCost),
        projectedRevenue: this.round(projectedRevenue),
        projectedMargin: this.round(projectedMargin),
      });
    }

    const finalWeek = weeklyProjection[weeklyProjection.length - 1];
    const totalMortalityPct =
      dto.initialAnimalCount === 0
        ? 0
        : ((dto.initialAnimalCount - Number(finalWeek.animalsAlive)) / dto.initialAnimalCount) *
          100;

    return {
      programType: dto.programType,
      programLabel: profile.label,
      assumptions: {
        cycleWeeks: dto.cycleWeeks,
        feedConversionRate: dto.feedConversionRate,
        weeklyMortalityRatePct: dto.weeklyMortalityRatePct,
        feedCostPerKg: dto.feedCostPerKg,
        salePricePerKg: dto.salePricePerKg,
      },
      summary: {
        initialAnimalCount: dto.initialAnimalCount,
        finalAnimalsAlive: Number(finalWeek.animalsAlive),
        totalMortalityPct: this.round(totalMortalityPct),
        finalWeightKg: finalWeek.avgWeightKg,
        finalBiomassKg: finalWeek.biomassKg,
        totalFeedKg: finalWeek.cumulativeFeedKg,
        totalFeedCost: finalWeek.cumulativeFeedCost,
        projectedRevenue: finalWeek.projectedRevenue,
        projectedMargin: finalWeek.projectedMargin,
        marginPerAnimal:
          Number(finalWeek.animalsAlive) > 0
            ? this.round(finalWeek.projectedMargin / Number(finalWeek.animalsAlive))
            : 0,
      },
      weeklyProjection,
    };
  }

  private fcaInclude() {
    return {
      farm: {
        select: {
          id: true,
          name: true,
          speciesType: true,
          client: {
            select: {
              id: true,
              fullName: true,
              companyName: true,
            },
          },
        },
      },
    } satisfies Prisma.FcaCalculationInclude;
  }

  private roiInclude() {
    return {
      farm: {
        select: {
          id: true,
          name: true,
          speciesType: true,
          client: {
            select: {
              id: true,
              fullName: true,
              companyName: true,
            },
          },
        },
      },
    } satisfies Prisma.RoiCalculationInclude;
  }

  private serializeFcaCalculation(
    calculation: FcaWithFarm,
    options?: {
      speciesType?: 'poultry' | 'swine';
      benchmarkFca?: number;
      initialWeightKg?: number;
      marketPricePerKg?: number;
    },
  ) {
    const speciesType = (options?.speciesType ??
      calculation.farm?.speciesType ??
      'poultry') as 'poultry' | 'swine';
    const benchmarkFca = options?.benchmarkFca ?? FCA_BENCHMARKS[speciesType];
    const initialWeightKg =
      options?.initialWeightKg ?? this.defaultInitialWeight(speciesType);
    const marketPricePerKg = options?.marketPricePerKg ?? 0;
    const aliveBirds = Math.max(0, calculation.birdCount - calculation.mortalityCount);
    const finalBiomassKg = aliveBirds * calculation.birdWeightKg;
    const initialBiomassKg = calculation.birdCount * initialWeightKg;
    const totalWeightGainKg = Math.max(0, finalBiomassKg - initialBiomassKg);
    const gapVsBenchmark = this.round(calculation.fcaResult - benchmarkFca, 4);
    const benchmarkStatus = this.getBenchmarkStatus(calculation.fcaResult, benchmarkFca);

    return {
      id: calculation.id,
      userId: calculation.userId,
      organizationId: calculation.organizationId,
      farmId: calculation.farmId,
      createdAt: calculation.createdAt,
      speciesType,
      inputs: {
        birdCount: calculation.birdCount,
        mortalityCount: calculation.mortalityCount,
        aliveBirds,
        feedConsumedKg: calculation.feedConsumedKg,
        birdWeightKg: calculation.birdWeightKg,
        initialWeightKg: this.round(initialWeightKg, 3),
        feedCostPerKg: calculation.feedCostPerKg,
        marketPricePerKg: this.round(marketPricePerKg),
      },
      results: {
        fca: calculation.fcaResult,
        benchmarkFca: this.round(benchmarkFca, 2),
        gapVsBenchmark,
        benchmarkStatus,
        totalWeightGainKg: this.round(totalWeightGainKg, 2),
        productionCostPerKg: calculation.productionCost,
        estimatedLosses: calculation.estimatedLosses,
        potentialSavings: calculation.potentialSavings,
        finalBiomassKg: this.round(finalBiomassKg, 2),
        mortalityRate: this.round(
          calculation.birdCount > 0
            ? (calculation.mortalityCount / calculation.birdCount) * 100
            : 0,
          2,
        ),
      },
      farm: calculation.farm
        ? {
            id: calculation.farm.id,
            name: calculation.farm.name,
            speciesType: calculation.farm.speciesType,
            client: calculation.farm.client,
          }
        : null,
    };
  }

  private serializeRoiCalculation(calculation: RoiWithFarm) {
    const totalBenefits = this.round(
      calculation.feedSavings + calculation.weightGainValue,
    );

    return {
      ...calculation,
      totalBenefits,
      paybackStatus:
        calculation.roiPercentage >= 35
          ? 'high'
          : calculation.roiPercentage >= 10
            ? 'medium'
            : 'low',
    };
  }

  private getBenchmarkStatus(fcaResult: number, benchmarkFca: number) {
    if (fcaResult <= benchmarkFca) {
      return 'excellent';
    }

    if (fcaResult <= benchmarkFca * 1.05) {
      return 'watch';
    }

    return 'critical';
  }

  private defaultInitialWeight(speciesType: 'poultry' | 'swine') {
    return speciesType === 'swine' ? 6 : 0.04;
  }

  private round(value: number, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  private requireOrganizationId(user: AuthUser) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'El usuario autenticado no tiene una organización asociada.',
      );
    }

    return user.organizationId;
  }

  private async ensureFarmBelongsToOrganization(id: string, organizationId: string) {
    const farm = await this.prisma.farm.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
        name: true,
        speciesType: true,
        client: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
          },
        },
      },
    });

    if (!farm) {
      throw new NotFoundException('La granja seleccionada no existe en la organización.');
    }

    return farm;
  }
}
