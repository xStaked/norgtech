import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Rutas públicas pasan sin validación
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }

    try {
      const supabase = createClient(
        this.configService.get('SUPABASE_URL'),
        this.configService.get('SUPABASE_SERVICE_ROLE_KEY'),
      );

      // Verificar JWT con Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedException('Token inválido o expirado');
      }

      // Obtener perfil con role y organizationId
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, organization_id')
        .eq('id', user.id)
        .single();

      const clientId = await this.resolveProducerClientId(
        profile?.role || 'cliente',
        profile?.organization_id || null,
        user.email,
      );

      // Inyectar usuario en el request
      request.user = {
        id: user.id,
        email: user.email,
        role: profile?.role || 'cliente',
        organizationId: profile?.organization_id || null,
        clientId,
      };

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Error al verificar autenticación');
    }
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  private async resolveProducerClientId(
    role: string,
    organizationId: string | null,
    email: string | undefined,
  ): Promise<string | null> {
    if (role !== 'cliente') {
      return null;
    }

    if (!organizationId) {
      throw new UnauthorizedException(
        'El productor autenticado no tiene organización asociada.',
      );
    }

    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new UnauthorizedException(
        'El productor autenticado no tiene un email válido para resolver su acceso.',
      );
    }

    const matchingClients = await this.prisma.client.findMany({
      where: {
        organizationId,
        email: normalizedEmail,
        status: 'active',
      },
      select: {
        id: true,
      },
      take: 2,
    });

    if (matchingClients.length !== 1) {
      throw new UnauthorizedException(
        'No existe una asociación única entre el productor autenticado y su ficha de cliente.',
      );
    }

    return matchingClients[0].id;
  }
}
