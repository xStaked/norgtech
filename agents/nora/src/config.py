import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    llm_provider: str = os.getenv("NORA_LLM_PROVIDER", "openai")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    qwen_api_key: str = os.getenv("QWEN_API_KEY", "")
    qwen_base_url: str = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    llm_model: str = os.getenv("NORA_LLM_MODEL", "gpt-4o-mini")
    llm_temperature: float = float(os.getenv("NORA_LLM_TEMPERATURE", "0.3"))
    nestjs_api_url: str = os.getenv("NESTJS_API_URL", "http://norgtech-api:3001")
    port: int = int(os.getenv("PORT", "8000"))

settings = Settings()
