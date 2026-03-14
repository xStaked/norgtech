import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { ClientsModule } from './clients/clients.module';
import { FarmsModule } from './farms/farms.module';
import { VisitsModule } from './visits/visits.module';
import { CalculatorsModule } from './calculators/calculators.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { SupabaseAuthGuard } from './common/guards/supabase-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    CasesModule,
    ClientsModule,
    FarmsModule,
    VisitsModule,
    CalculatorsModule,
    DashboardModule,
    KnowledgeModule,
  ],
  providers: [
    // Guard global: todas las rutas requieren auth salvo @Public()
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
