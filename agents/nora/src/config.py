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
    # El SDK de OpenAI espera 600s por defecto: con los reintentos de arriba una
    # llamada colgada bloquea el turno por horas. Una llamada sana tarda <15s.
    llm_request_timeout: float = float(os.getenv("NORA_LLM_REQUEST_TIMEOUT", "60"))
    # Tope de la respuesta: Nora contesta por chat/WhatsApp (parrafos cortos) o
    # con un tool call; sin tope un loop de generacion puede correr minutos.
    llm_max_tokens: int = int(os.getenv("NORA_LLM_MAX_TOKENS", "2000"))
    nestjs_api_url: str = os.getenv("NESTJS_API_URL", "http://localhost:3001")
    # Para armar enlaces al portal (reportes). Mismo nombre de variable que usa
    # el API en auth.service: por WhatsApp un "/reports/x" relativo no sirve.
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    port: int = int(os.getenv("PORT", "8000"))

settings = Settings()
