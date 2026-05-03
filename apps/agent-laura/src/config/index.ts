import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "../../../../apps/api/.env");

dotenv.config({ path: envPath });

export const config = {
  port: Number(process.env.AGENT_LAURA_PORT ?? 3100),
  nestjsBaseUrl: process.env.NESTJS_BASE_URL ?? "http://localhost:3001",
  nestjsServiceToken: process.env.NESTJS_SERVICE_TOKEN ?? "",
  databaseUrl: process.env.AGENT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  llm: {
    provider: (process.env.LAURA_LLM_PROVIDER ?? "deepseek") as "deepseek" | "qwen" | "openai",
    model: process.env.LAURA_LLM_MODEL,
    timeoutMs: Number(process.env.LAURA_LLM_TIMEOUT_MS ?? "30000"),
  },
} as const;

export type Config = typeof config;