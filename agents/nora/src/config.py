import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    llm_provider: str = os.getenv("NORA_LLM_PROVIDER", "openai")
    # OpenAI
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    # DeepSeek
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    # Qwen
    qwen_api_key: str = os.getenv("QWEN_API_KEY", "")
    qwen_base_url: str = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    qwen_model: str = os.getenv("QWEN_MODEL", "qwen-plus")
    # General
    llm_temperature: float = float(os.getenv("NORA_LLM_TEMPERATURE", "0.3"))
    # Un turno de pedido encadena varias llamadas y satura el TPM de la cuenta:
    # el 429 se resuelve esperando ~1s, no cayendo al fallback.
    llm_max_retries: int = int(os.getenv("NORA_LLM_MAX_RETRIES", "6"))
    nestjs_api_url: str = os.getenv("NESTJS_API_URL", "http://localhost:3001")
    port: int = int(os.getenv("PORT", "8000"))

settings = Settings()
