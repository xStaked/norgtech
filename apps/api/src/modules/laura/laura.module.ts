import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { FollowUpTasksModule } from "../follow-up-tasks/follow-up-tasks.module";
import {
  DeterministicLauraExtractorProvider,
  LAURA_EXTRACTOR_PROVIDER,
  LauraLlmService,
} from "./laura-llm.service";
import { LauraLlmExtractorProvider } from "./laura-llm-extractor.provider";
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
    ConfigModule.forRoot(),
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
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>("LAURA_LLM_PROVIDER") ?? "deterministic";
        const hasApiKey = provider === "deepseek"
          ? Boolean(configService.get<string>("DEEPSEEK_API_KEY"))
          : provider === "qwen"
            ? Boolean(configService.get<string>("QWEN_API_KEY"))
            : false;

        if (provider !== "deterministic" && hasApiKey) {
          return new LauraLlmExtractorProvider(configService);
        }
        return new DeterministicLauraExtractorProvider();
      },
      inject: [ConfigService],
    },
  ],
  exports: [LauraService],
})
export class LauraModule {}