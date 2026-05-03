import { config } from "./config/index.js";

console.log(`@norgtech/agent-laura starting on port ${config.port}`);
console.log(`LLM provider: ${config.llm.provider}`);
console.log(`NestJS base URL: ${config.nestjsBaseUrl}`);