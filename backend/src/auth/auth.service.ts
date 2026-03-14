import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async getProfile(user: AuthUser) {
    const profile = await this.prisma.profile.findUnique({
      where: {
        id: user.id,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!profile) {
      return {
        id: user.id,
        email: user.email,
        fullName: null,
        role: user.role,
        organizationId: user.organizationId,
        organization: null,
      };
    }

    return {
      id: profile.id,
      email: profile.email ?? user.email,
      fullName: profile.fullName,
      role: profile.role,
      organizationId: profile.organizationId,
      organization: profile.organization,
    };
  }
}
