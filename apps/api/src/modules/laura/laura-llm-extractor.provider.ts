import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { fillPromptSections } from "./prompts/prompt-sections";
import type { LauraExtractorProvider } from "./laura-llm.service";

const MAX_RETRIES = 1;

const PROVIDER_CONFIG = {
  deepseek: {
    defaultModel: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
    envBaseUrl: "DEEPSEEK_BASE_URL",
    fallbackBaseUrl: "https://api.deepseek.com",
  },
  qwen: {
    defaultModel: "qwen-plus",
    envKey: "QWEN_API_KEY",
    envBaseUrl: "QWEN_BASE_URL",
    fallbackBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
} as const;

type LauraProvider = keyof typeof PROVIDER_CONFIG;

@Injectable()
export class LauraLlmExtractorProvider implements LauraExtractorProvider {
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly logger = new Logger(LauraLlmExtractorProvider.name);
  private readonly providerName: string;

  constructor(private readonly configService: ConfigService) {
    const provider = (this.configService.get<string>("LAURA_LLM_PROVIDER") ?? "deepseek") as LauraProvider;
    const config = PROVIDER_CONFIG[provider] ?? PROVIDER_CONFIG.deepseek;
    this.providerName = provider;

    const apiKey = this.configService.get<string>(config.envKey);
    const baseUrl = this.configService.get<string>(config.envBaseUrl) ?? config.fallbackBaseUrl;
    this.model = this.configService.get<string>("LAURA_LLM_MODEL") ?? config.defaultModel;
    this.timeoutMs = Number(this.configService.get<string>("LAURA_LLM_TIMEOUT_MS") ?? "30000");

    if (!apiKey) {
      this.client = null;
      this.logger.warn(`No API key configured for ${provider} (${config.envKey}). Laura will use deterministic extraction as fallback.`);
    } else {
      this.client = new OpenAI({ apiKey, baseURL: baseUrl });
      this.logger.log(`Laura LLM provider: ${provider}, model: ${this.model}, baseUrl: ${baseUrl}`);
    }
  }

  async extract(input: {
    message: string;
    contextSummary?: string;
    recentMessages: string[];
    systemPrompt: string;
  }): Promise<string> {
    if (!this.client) {
      throw new BadRequestException(`Laura LLM provider (${this.providerName}) is not configured. Set the appropriate API key in environment variables.`);
    }

    const filledSystemPrompt = fillPromptSections(input.systemPrompt, {
      context: input.contextSummary ?? "",
      recentMessages: input.recentMessages.join("\n"),
    });

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.chat.completions.create(
          {
            model: this.model,
            response_format: { type: "json_object" },
            temperature: 0.3,
            max_tokens: 1024,
            messages: [
              { role: "system", content: filledSystemPrompt },
              { role: "user", content: input.message },
            ],
          },
          { timeout: this.timeoutMs },
        );

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new BadRequestException("Laura extractor returned empty response");
        }

        return content;
      } catch (error: unknown) {
        lastError = error;
        this.logger.warn(
          `LLM extraction attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`,
        );

        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw new BadRequestException(
      `Laura LLM extraction failed after ${MAX_RETRIES + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }
}