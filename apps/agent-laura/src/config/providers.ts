import { ChatOpenAI } from "@langchain/openai";
import { config } from "./index.js";

const PROVIDER_CONFIGS = {
  deepseek: {
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
  },
  qwen: {
    defaultModel: "qwen-plus",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  openai: {
    defaultModel: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
  },
} as const;

type ProviderName = keyof typeof PROVIDER_CONFIGS;

function getApiKey(provider: ProviderName): string | undefined {
  switch (provider) {
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY;
    case "qwen":
      return process.env.QWEN_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
  }
}

export function createLlm(): ChatOpenAI {
  const provider = config.llm.provider as ProviderName;
  const providerConfig = PROVIDER_CONFIGS[provider] ?? PROVIDER_CONFIGS.deepseek;
  const apiKey = getApiKey(provider);

  if (!apiKey) {
    throw new Error(
      `No API key configured for LLM provider "${provider}". Set the appropriate environment variable.`
    );
  }

  return new ChatOpenAI({
    modelName: config.llm.model ?? providerConfig.defaultModel,
    temperature: 0.3,
    maxTokens: 1024,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: process.env[`${provider.toUpperCase()}_BASE_URL`] ?? providerConfig.baseUrl,
    },
    maxRetries: 1,
    timeout: config.llm.timeoutMs,
  });
}