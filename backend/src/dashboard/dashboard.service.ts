import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const DASHBOARD_CASE_STATUSES = [
  'open',
  'in_analysis',
  'treatment',
  'waiting_client',
] as const;

const ADVISOR_ROLES = ['admin', 'asesor_tecnico', 'asesor_comercial'] as const;

type DashboardCaseStatus = (typeof DASHBOARD_CASE_STATUSES)[number];

type DashboardStatsResponse = {
  activeClients: number;
  openCases: number;
  casesByStatus: Record<DashboardCaseStatus, number>;
  avgResponseTimeHours: number;
  visitsThisMonth: number;
  advisorActivity: Array<{
    advisorId: string;
    name: string;
    openCases: number;
    closedCases: number;
    visitsThisMonth: number;
  }>;
};

type PortalDashboardStatsResponse = {
  client: {
    id: string;
    fullName: string;
    companyName: string | null;
  };
  openCases: number;
  pendingRecommendations: number;
  lastVisit: {
    id: string;
    visitDate: Date;
    recommendations: string | null;
    observations: string | null;
    farm: {
      id: string;
      name: string;
      speciesType: string;
    };
  } | null;
  casesByStatus: Record<DashboardCaseStatus | 'closed', number>;
  farms: number;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminStats(user: AuthUser): Promise<DashboardStatsResponse> {
    const organizationId = this.requireOrganizationId(user);
    return this.buildDashboardStats({
      organizationId,
      activeClientsWhere: {
        organizationId,
        status: 'active',
      },
      casesWhere: {
        organizationId,
      },
      visitsWhere: {
        organizationId,
      },
      advisorActivityMode: 'organization',
      fallbackAdvisor: {
        id: user.id,
        name: this.getDisplayNameFromUser(user),
      },
    });
  }

  async getAdvisorStats(user: AuthUser): Promise<DashboardStatsResponse> {
    const organizationId = this.requireOrganizationId(user);
    return this.buildDashboardStats({
      organizationId,
      activeClientsWhere: {
        organizationId,
        status: 'active',
        assignedAdvisorId: user.id,
      },
      casesWhere: {
        organizationId,
        assignedTechId: user.id,
      },
      visitsWhere: {
        organizationId,
        advisorId: user.id,
      },
      advisorActivityMode: 'single',
      fallbackAdvisor: {
        id: user.id,
        name: await this.getAdvisorName(user.id, organizationId, this.getDisplayNameFromUser(user)),
      },
    });
  }

  async getPortalStats(user: AuthUser): Promise<PortalDashboardStatsResponse> {
    const organizationId = this.requireOrganizationId(user);
    const client = await this.resolveClientFromUser(user, organizationId);

    const [casesByStatusRaw, pendingRecommendations, lastVisit, farms] =
      await Promise.all([
        this.prisma.case.groupBy({
          by: ['status'],
          where: {
            organizationId,
            clientId: client.id,
          },
          _count: {
            _all: true,
          },
        }),
        this.prisma.technicalVisit.count({
          where: {
            organizationId,
            clientId: client.id,
            recommendations: {
              not: null,
            },
          },
        }),
        this.prisma.technicalVisit.findFirst({
          where: {
            organizationId,
            clientId: client.id,
          },
          orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            visitDate: true,
            recommendations: true,
            observations: true,
            farm: {
              select: {
                id: true,
                name: true,
                speciesType: true,
              },
            },
          },
        }),
        this.prisma.farm.count({
          where: {
            organizationId,
            clientId: client.id,
          },
        }),
      ]);

    const casesByStatus = {
      open: 0,
      in_analysis: 0,
      treatment: 0,
      waiting_client: 0,
      closed: 0,
    } satisfies Record<DashboardCaseStatus | 'closed', number>;

    casesByStatusRaw.forEach((item) => {
      if (item.status in casesByStatus) {
        casesByStatus[item.status as keyof typeof casesByStatus] = item._count._all;
      }
    });

    return {
      client,
      openCases:
        casesByStatus.open +
        casesByStatus.in_analysis +
        casesByStatus.treatment +
        casesByStatus.waiting_client,
      pendingRecommendations,
      lastVisit,
      casesByStatus,
      farms,
    };
  }

  private async buildDashboardStats(params: {
    organizationId: string;
    activeClientsWhere: Prisma.ClientWhereInput;
    casesWhere: Prisma.CaseWhereInput;
    visitsWhere: Prisma.TechnicalVisitWhereInput;
    advisorActivityMode: 'organization' | 'single';
    fallbackAdvisor: { id: string; name: string };
  }): Promise<DashboardStatsResponse> {
    const monthRange = this.getCurrentMonthRange();

    const [
      activeClients,
      caseCounts,
      avgResponseTimeHours,
      visitsThisMonth,
      advisorActivity,
    ] = await Promise.all([
      this.prisma.client.count({
        where: params.activeClientsWhere,
      }),
      this.getCaseCounts(params.casesWhere),
      this.getAverageResponseTimeHours(params.casesWhere),
      this.prisma.technicalVisit.count({
        where: {
          ...params.visitsWhere,
          visitDate: {
            gte: monthRange.start,
            lt: monthRange.end,
          },
        },
      }),
      this.getAdvisorActivity({
        organizationId: params.organizationId,
        mode: params.advisorActivityMode,
        advisorId:
          params.advisorActivityMode === 'single' ? params.fallbackAdvisor.id : undefined,
        monthRange,
        fallbackAdvisor: params.fallbackAdvisor,
      }),
    ]);

    const openCases = DASHBOARD_CASE_STATUSES.reduce(
      (sum, status) => sum + caseCounts[status],
      0,
    );

    return {
      activeClients,
      openCases,
      casesByStatus: caseCounts,
      avgResponseTimeHours,
      visitsThisMonth,
      advisorActivity,
    };
  }

  private async getCaseCounts(
    where: Prisma.CaseWhereInput,
  ): Promise<Record<DashboardCaseStatus, number>> {
    const grouped = await this.prisma.case.groupBy({
      by: ['status'],
      where,
      _count: {
        _all: true,
      },
    });

    const counts = DASHBOARD_CASE_STATUSES.reduce(
      (accumulator, status) => ({
        ...accumulator,
        [status]: 0,
      }),
      {} as Record<DashboardCaseStatus, number>,
    );

    grouped.forEach((item) => {
      if (item.status in counts) {
        counts[item.status as DashboardCaseStatus] = item._count._all;
      }
    });

    return counts;
  }

  private async getAverageResponseTimeHours(where: Prisma.CaseWhereInput) {
    const cases = await this.prisma.case.findMany({
      where,
      select: {
        createdAt: true,
        messages: {
          select: {
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 1,
        },
      },
    });

    const responseTimes = cases
      .map((caseRecord) => {
        const firstMessage = caseRecord.messages[0];

        if (!firstMessage) {
          return null;
        }

        const diffMs =
          new Date(firstMessage.createdAt).getTime() -
          new Date(caseRecord.createdAt).getTime();

        if (diffMs < 0) {
          return null;
        }

        return diffMs / (1000 * 60 * 60);
      })
      .filter((value): value is number => value !== null);

    if (responseTimes.length === 0) {
      return 0;
    }

    const total = responseTimes.reduce((sum, value) => sum + value, 0);
    return Number((total / responseTimes.length).toFixed(1));
  }

  private async getAdvisorActivity(params: {
    organizationId: string;
    mode: 'organization' | 'single';
    advisorId?: string;
    monthRange: { start: Date; end: Date };
    fallbackAdvisor: { id: string; name: string };
  }) {
    const advisorWhere: Prisma.ProfileWhereInput = {
      organizationId: params.organizationId,
      role: {
        in: [...ADVISOR_ROLES],
      },
      ...(params.mode === 'single' && params.advisorId ? { id: params.advisorId } : {}),
    };

    const [advisors, openCases, closedCases, visits] = await Promise.all([
      this.prisma.profile.findMany({
        where: advisorWhere,
        select: {
          id: true,
          fullName: true,
          email: true,
        },
        orderBy: {
          fullName: 'asc',
        },
      }),
      this.prisma.case.groupBy({
        by: ['assignedTechId'],
        where: {
          organizationId: params.organizationId,
          assignedTechId: {
            not: null,
          },
          status: {
            in: [...DASHBOARD_CASE_STATUSES],
          },
          ...(params.mode === 'single' && params.advisorId
            ? { assignedTechId: params.advisorId }
            : {}),
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.case.groupBy({
        by: ['assignedTechId'],
        where: {
          organizationId: params.organizationId,
          assignedTechId: {
            not: null,
          },
          status: 'closed',
          ...(params.mode === 'single' && params.advisorId
            ? { assignedTechId: params.advisorId }
            : {}),
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.technicalVisit.groupBy({
        by: ['advisorId'],
        where: {
          organizationId: params.organizationId,
          visitDate: {
            gte: params.monthRange.start,
            lt: params.monthRange.end,
          },
          ...(params.mode === 'single' && params.advisorId
            ? { advisorId: params.advisorId }
            : {}),
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const openCasesMap = new Map(
      openCases
        .filter((item) => item.assignedTechId)
        .map((item) => [item.assignedTechId as string, item._count._all]),
    );

    const closedCasesMap = new Map(
      closedCases
        .filter((item) => item.assignedTechId)
        .map((item) => [item.assignedTechId as string, item._count._all]),
    );

    const visitsMap = new Map(visits.map((item) => [item.advisorId, item._count._all]));

    const advisorRows =
      advisors.length > 0
        ? advisors
        : [
            {
              id: params.fallbackAdvisor.id,
              fullName: params.fallbackAdvisor.name,
              email: null,
            },
          ];

    return advisorRows.map((advisor) => ({
      advisorId: advisor.id,
      name: advisor.fullName?.trim() || advisor.email || params.fallbackAdvisor.name,
      openCases: openCasesMap.get(advisor.id) ?? 0,
      closedCases: closedCasesMap.get(advisor.id) ?? 0,
      visitsThisMonth: visitsMap.get(advisor.id) ?? 0,
    }));
  }

  private async getAdvisorName(
    advisorId: string,
    organizationId: string,
    fallbackName: string,
  ) {
    const advisor = await this.prisma.profile.findFirst({
      where: {
        id: advisorId,
        organizationId,
      },
      select: {
        fullName: true,
        email: true,
      },
    });

    return advisor?.fullName?.trim() || advisor?.email || fallbackName;
  }

  private getCurrentMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return { start, end };
  }

  private getDisplayNameFromUser(user: AuthUser) {
    return user.email?.trim() || 'Asesor';
  }

  private requireOrganizationId(user: AuthUser) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'El usuario autenticado no tiene una organización asociada.',
      );
    }

    return user.organizationId;
  }

  private async resolveClientFromUser(user: AuthUser, organizationId: string) {
    const email = user.email?.trim().toLowerCase();
    if (email) {
      const client = await this.prisma.client.findFirst({
        where: {
          organizationId,
          email,
          status: 'active',
        },
        select: {
          id: true,
          fullName: true,
          companyName: true,
        },
      });

      if (client) {
        return client;
      }
    }

    const activeClients = await this.prisma.client.findMany({
      where: {
        organizationId,
        status: 'active',
      },
      select: {
        id: true,
        fullName: true,
        companyName: true,
      },
      take: 2,
    });

    if (activeClients.length === 1) {
      return activeClients[0];
    }

    throw new BadRequestException(
      'No existe un productor activo asociado al usuario autenticado.',
    );
  }
}
