import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { FollowUpTasksModule } from "../follow-up-tasks/follow-up-tasks.module";
import {
  DeterministicLauraExtractorProvider,
  LAURA_EXTRACTOR_PROVIDER,
  LauraLlmService,
} from "./laura-llm.service";
import { LauraContextResolverService } from "./laura-context-resolver.service";
import { LauraController } from "./laura.controller";
import { LauraPersistenceService } from "./laura-persistence.service";
import { LauraSessionService } from "./laura-session.service";
import { LauraService } from "./laura.service";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { VisitsModule } from "../visits/visits.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    OpportunitiesModule,
    FollowUpTasksModule,
    VisitsModule,
  ],
  controllers: [LauraController],
  providers: [
    LauraService,
    LauraSessionService,
    LauraContextResolverService,
    LauraPersistenceService,
    LauraLlmService,
    DeterministicLauraExtractorProvider,
    {
      provide: LAURA_EXTRACTOR_PROVIDER,
      useExisting: DeterministicLauraExtractorProvider,
    },
  ],
  exports: [LauraService],
})
export class LauraModule {}
