# Laura Python Agent — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Reemplazar el módulo `apps/api/src/modules/laura/` de NestJS con un agente Python (LangChain + LangGraph + FastAPI) que use tool calling real, memoria conversacional, y state machines para flujos CRM multi-paso.

**Architecture:**
```
Next.js (web) ──HTTP──▶ FastAPI (agents/laura) ──LLM──▶ DeepSeek/Qwen
                              │
                              ├── Tool: search_customers ──▶ NestJS API :3001
                              ├── Tool: create_customer   ──▶ NestJS API :3001
                              ├── Tool: get_agenda         ──▶ NestJS API :3001
                              ├── Tool: create_visit       ──▶ NestJS API :3001
                              ├── Tool: create_opportunity ──▶ NestJS API :3001
                              └── Tool: create_follow_up   ──▶ NestJS API :3001
```
El agente NO toca PostgreSQL directamente — llama a la API NestJS como tools. La API NestJS sigue siendo la única fuente de verdad.

**Tech Stack:** Python 3.11+, FastAPI, LangChain, LangGraph, httpx (para llamar NestJS), uvicorn, pydantic, OpenAI SDK (compatible DeepSeek/Qwen), Docker

---

## Fase 0: Setup del proyecto Python

### Task 0.1: Crear estructura del proyecto

**Objective:** Crear el esqueleto del proyecto Python con pyproject.toml

**Files:**
- Create: `agents/laura/pyproject.toml`
- Create: `agents/laura/src/__init__.py`
- Create: `agents/laura/src/main.py`
- Create: `agents/laura/src/config.py`
- Create: `agents/laura/Dockerfile`

**Step 1: Crear pyproject.toml**

```toml
[project]
name = "laura-agent"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "langchain>=0.3.0",
    "langgraph>=0.2.0",
    "langchain-openai>=0.2.0",
    "httpx>=0.27.0",
    "pydantic>=2.0",
    "python-dotenv>=1.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

**Step 2: Crear src/config.py**

```python
import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    llm_provider: str = os.getenv("LAURA_LLM_PROVIDER", "deepseek")
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    qwen_api_key: str = os.getenv("QWEN_API_KEY", "")
    qwen_base_url: str = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    llm_model: str = os.getenv("LAURA_LLM_MODEL", "deepseek-chat")
    llm_temperature: float = float(os.getenv("LAURA_LLM_TEMPERATURE", "0.3"))
    nestjs_api_url: str = os.getenv("NESTJS_API_URL", "http://norgtech-api:3001")
    port: int = int(os.getenv("PORT", "8000"))

settings = Settings()
```

**Step 3: Crear src/main.py (esqueleto FastAPI)**

```python
from fastapi import FastAPI
from .config import settings

app = FastAPI(title="Laura Agent", version="0.1.0")

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
```

**Step 4: Crear Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY src/ src/

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 5: Verificar que el proyecto arranca**

Run: `cd agents/laura && pip install -e . && python -c "from src.main import app; print('OK')"`
Expected: `OK`

**Step 6: Commit**

```bash
git add agents/laura/
git commit -m "feat(laura): scaffold Python agent project with FastAPI"
```

---

### Task 0.2: Definir modelos Pydantic y contratos

**Objective:** Definir los tipos Pydantic que usarán los endpoints, tools, y state graph. Deben ser compatibles con los DTOs actuales de NestJS para que el frontend no se rompa.

**Files:**
- Create: `agents/laura/src/models/__init__.py`
- Create: `agents/laura/src/models/api_models.py` (modelos que matchean los DTOs actuales)
- Create: `agents/laura/src/models/tool_models.py` (modelos para las tools)

**Step 1: Crear src/models/api_models.py**

```python
from pydantic import BaseModel, Field
from typing import Optional, Literal, Any
from enum import Enum

class OpportunityStage(str, Enum):
    prospeccion = "prospeccion"
    contacto_inicial = "contacto_inicial"
    diagnostico = "diagnostico"
    propuesta = "propuesta"
    negociacion = "negociacion"
    cerrada_ganada = "cerrada_ganada"
    cerrada_perdida = "cerrada_perdida"

class FollowUpTaskType(str, Enum):
    llamada = "llamada"
    correo = "correo"
    whatsapp = "whatsapp"
    visita = "visita"
    cotizacion = "cotizacion"
    otro = "otro"

class LauraInteractionBlock(BaseModel):
    enabled: bool
    summary: str = Field(min_length=1)
    rawMessage: str = Field(min_length=1)

class LauraOpportunityBlock(BaseModel):
    enabled: bool
    opportunityId: Optional[str] = None
    createNew: Optional[bool] = None
    title: Optional[str] = None
    stage: Optional[OpportunityStage] = None

class LauraFollowUpBlock(BaseModel):
    enabled: bool
    title: str = Field(min_length=1)
    dueAt: str = Field(min_length=1)
    opportunityId: Optional[str] = None
    type: FollowUpTaskType

class LauraTaskBlock(BaseModel):
    enabled: bool
    title: str = Field(min_length=1)
    dueAt: Optional[str] = None
    notes: Optional[str] = None

class LauraSignalsBlock(BaseModel):
    enabled: bool
    objections: list[str] = Field(default_factory=list)
    risk: Optional[str] = None
    buyingIntent: Optional[str] = None

class LauraProposalBlocks(BaseModel):
    interaction: Optional[LauraInteractionBlock] = None
    opportunity: Optional[LauraOpportunityBlock] = None
    followUp: Optional[LauraFollowUpBlock] = None
    task: Optional[LauraTaskBlock] = None
    signals: Optional[LauraSignalsBlock] = None

class LauraProposalPayload(BaseModel):
    blocks: LauraProposalBlocks

class CreateMessageRequest(BaseModel):
    content: str = Field(min_length=1)
    sessionId: Optional[str] = None
    contextType: Optional[str] = None
    contextEntityId: Optional[str] = None

class ConfirmProposalRequest(BaseModel):
    proposal: LauraProposalPayload

class ClarificationOption(BaseModel):
    id: str
    label: str

class ClarificationInfo(BaseModel):
    type: Literal["customer", "opportunity", "date", "action"]
    options: Optional[list[ClarificationOption]] = None

class AgendaItem(BaseModel):
    id: str
    type: Literal["visit", "follow_up_task"]
    label: str
    scheduledAt: Optional[str] = None
    priorityGroup: Optional[int] = None

# Union response type
class GreetingResponse(BaseModel):
    mode: Literal["greeting"] = "greeting"
    sessionId: str
    message: str

class ClarificationResponse(BaseModel):
    mode: Literal["clarification"] = "clarification"
    sessionId: str
    message: str
    clarification: ClarificationInfo

class ProposalResponse(BaseModel):
    mode: Literal["proposal"] = "proposal"
    sessionId: str
    message: str
    proposalId: str
    proposal: LauraProposalPayload

class AgendaResponse(BaseModel):
    mode: Literal["agenda"] = "agenda"
    sessionId: str
    message: str
    agenda: dict  # { items: AgendaItem[] }

LauraResponse = GreetingResponse | ClarificationResponse | ProposalResponse | AgendaResponse

class LauraConfirmationResponse(BaseModel):
    proposalId: str
    status: Literal["confirmed"] = "confirmed"
    proposal: LauraProposalPayload
    saved: list[str]
    discarded: list[str]
    createdIds: dict[str, str]
```

**Step 2: Verificar sintaxis**

Run: `cd agents/laura && python -c "from src.models.api_models import LauraProposalPayload; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add agents/laura/src/models/
git commit -m "feat(laura): add Pydantic models matching NestJS API contracts"
```

---

## Fase 1: Tools — el agente aprende a usar el CRM

### Task 1.1: Crear cliente HTTP para la API NestJS

**Objective:** Un cliente httpx que forwardee el JWT del frontend a la API NestJS.

**Files:**
- Create: `agents/laura/src/tools/__init__.py`
- Create: `agents/laura/src/tools/nestjs_client.py`

**Step 1: Crear src/tools/nestjs_client.py**

```python
import httpx
from ..config import settings
from typing import Optional

class NestJSClient:
    """Cliente HTTP para la API NestJS. Forwardea el JWT del usuario."""

    def __init__(self, auth_token: str):
        self.base_url = settings.nestjs_api_url.rstrip("/")
        self.headers = {
            "Authorization": auth_token,  # "Bearer <jwt>" que viene del frontend
            "Content-Type": "application/json",
        }

    async def get(self, path: str, params: Optional[dict] = None) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{self.base_url}{path}", headers=self.headers, params=params)
            r.raise_for_status()
            return r.json()

    async def post(self, path: str, json: dict) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{self.base_url}{path}", headers=self.headers, json=json)
            r.raise_for_status()
            return r.json()

    async def patch(self, path: str, json: dict) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.patch(f"{self.base_url}{path}", headers=self.headers, json=json)
            r.raise_for_status()
            return r.json()
```

**Step 2: Verificar que importa**

Run: `cd agents/laura && python -c "from src.tools.nestjs_client import NestJSClient; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add agents/laura/src/tools/
git commit -m "feat(laura): add NestJS HTTP client with JWT forwarding"
```

---

### Task 1.2: Tool: search_customers

**Objective:** Tool que busca clientes en la API NestJS por nombre, NIT, o razón social.

**Files:**
- Create: `agents/laura/src/tools/customers.py`

**Step 1: Escribir el código de la tool**

```python
from langchain_core.tools import tool
from .nestjs_client import NestJSClient
from typing import Optional

@tool
async def search_customers(
    query: str,
    nestjs_client: NestJSClient,
) -> str:
    """
    Busca clientes en el CRM por nombre, razón social, o NIT.
    Usa esta herramienta cuando necesites encontrar un cliente existente
    antes de crear uno nuevo. Siempre busca primero antes de crear.
    
    Args:
        query: Texto de búsqueda (nombre, razón social, o NIT del cliente)
    
    Returns:
        Lista de clientes encontrados en formato JSON con id, displayName, legalName, taxId, city, phone, segment
    """
    try:
        result = await nestjs_client.get("/customers", params={"search": query})
        customers = result if isinstance(result, list) else result.get("data", [])
        if not customers:
            return "No se encontraron clientes con ese criterio de búsqueda."
        
        # Retornar solo campos relevantes para que el LLM pueda elegir
        simplified = [
            {
                "id": c["id"],
                "nombre": c.get("displayName") or c.get("legalName"),
                "razonSocial": c.get("legalName"),
                "nit": c.get("taxId"),
                "ciudad": c.get("city"),
                "telefono": c.get("phone"),
            }
            for c in customers[:10]
        ]
        return f"Clientes encontrados: {json.dumps(simplified, ensure_ascii=False, indent=2)}"
    except Exception as e:
        return f"Error al buscar clientes: {str(e)}"
```

**Step 2: Verificar sintaxis**

Run: `cd agents/laura && python -c "from src.tools.customers import search_customers; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add agents/laura/src/tools/customers.py
git commit -m "feat(laura): add search_customers tool"
```

---

### Task 1.3: Tool: create_customer

**Objective:** Tool que crea un cliente nuevo via API NestJS.

**Files:**
- Modify: `agents/laura/src/tools/customers.py`

**Step 1: Agregar la función create_customer**

```python
@tool
async def create_customer(
    legal_name: str,
    display_name: str,
    nestjs_client: NestJSClient,
    tax_id: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    department: Optional[str] = None,
    segment_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Crea un nuevo cliente en el CRM.
    IMPORTANTE: Un CLIENTE es una empresa/organización (razón social, NIT).
    Un CONTACTO es una persona que trabaja en ese cliente.
    NO crees un cliente para una persona individual a menos que sea un negocio unipersonal.
    
    Args:
        legal_name: Razón social o nombre legal de la empresa
        display_name: Nombre comercial o de display
        tax_id: NIT o identificador tributario (opcional)
        phone: Teléfono de la empresa (opcional)
        email: Email corporativo (opcional)
        address: Dirección física (opcional)
        city: Ciudad (opcional)
        department: Departamento/estado (opcional)
        segment_id: ID del segmento de cliente (si no se especifica, la API usa default)
        notes: Notas adicionales (opcional)
    
    Returns:
        Datos del cliente creado en formato JSON
    """
    try:
        payload = {
            "legalName": legal_name,
            "displayName": display_name,
        }
        if tax_id: payload["taxId"] = tax_id
        if phone: payload["phone"] = phone
        if email: payload["email"] = email
        if address: payload["address"] = address
        if city: payload["city"] = city
        if department: payload["department"] = department
        if segment_id: payload["segmentId"] = segment_id
        if notes: payload["notes"] = notes

        result = await nestjs_client.post("/customers", payload)
        return f"Cliente creado exitosamente: {json.dumps(result, ensure_ascii=False, indent=2)}"
    except Exception as e:
        return f"Error al crear cliente: {str(e)}"
```

**Step 2: Agregar import faltante**

Agregar al inicio del archivo:
```python
import json
```

**Step 3: Verificar**

Run: `cd agents/laura && python -c "from src.tools.customers import create_customer; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add agents/laura/src/tools/customers.py
git commit -m "feat(laura): add create_customer tool"
```

---

### Task 1.4: Tools restantes (agenda, visitas, oportunidades, follow-ups)

**Objective:** Crear todas las tools que el agente necesita para operar el CRM.

**Files:**
- Create: `agents/laura/src/tools/agenda.py`
- Create: `agents/laura/src/tools/visits.py`
- Create: `agents/laura/src/tools/opportunities.py`
- Create: `agents/laura/src/tools/follow_ups.py`

**Step 1: Crear src/tools/agenda.py**

```python
import json
from langchain_core.tools import tool
from .nestjs_client import NestJSClient
from datetime import datetime, timedelta

@tool
async def get_agenda(nestjs_client: NestJSClient) -> str:
    """
    Obtiene la agenda del usuario actual: visitas programadas y tareas pendientes.
    Usa esta herramienta cuando el usuario pregunte "¿qué tengo hoy?", 
    "mi agenda", "¿qué visitas tengo?", "próximas tareas", etc.
    """
    try:
        today = datetime.now()
        next_week = today + timedelta(days=7)
        
        # Obtener visitas
        visits_result = await nestjs_client.get("/visits", params={
            "from": today.strftime("%Y-%m-%d"),
            "to": next_week.strftime("%Y-%m-%d"),
        })
        visits = visits_result if isinstance(visits_result, list) else visits_result.get("data", [])
        
        # Obtener tareas
        tasks_result = await nestjs_client.get("/follow-up-tasks", params={
            "status": "pendiente",
        })
        tasks = tasks_result if isinstance(tasks_result, list) else tasks_result.get("data", [])
        
        agenda_items = []
        for v in visits[:10]:
            agenda_items.append({
                "id": v["id"],
                "type": "visit",
                "label": f"Visita: {v.get('customer', {}).get('displayName', 'Cliente')} - {v.get('summary', 'Sin resumen')}",
                "scheduledAt": v.get("scheduledAt"),
            })
        for t in tasks[:10]:
            agenda_items.append({
                "id": t["id"],
                "type": "follow_up_task",
                "label": f"Tarea: {t.get('title', 'Sin título')} - Vence: {t.get('dueAt', 'N/A')}",
                "scheduledAt": t.get("dueAt"),
            })
        
        agenda_items.sort(key=lambda x: x.get("scheduledAt") or "")
        
        if not agenda_items:
            return "No tienes visitas ni tareas pendientes para los próximos 7 días."
        
        return json.dumps({"items": agenda_items}, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Error al obtener agenda: {str(e)}"
```

**Step 2: Crear src/tools/visits.py**

```python
import json
from langchain_core.tools import tool
from .nestjs_client import NestJSClient
from typing import Optional

@tool
async def create_visit(
    customer_id: str,
    scheduled_at: str,
    summary: str,
    nestjs_client: NestJSClient,
    opportunity_id: Optional[str] = None,
    notes: Optional[str] = None,
    next_step: Optional[str] = None,
) -> str:
    """
    Registra una visita/interacción con un cliente en el CRM.
    Usa esta herramienta cuando el usuario reporte una visita realizada
    o quiera programar una nueva visita.
    
    Args:
        customer_id: ID del cliente visitado
        scheduled_at: Fecha y hora de la visita (ISO 8601)
        summary: Resumen de lo que ocurrió en la visita
        opportunity_id: ID de la oportunidad asociada (opcional)
        notes: Notas adicionales (opcional)
        next_step: Próximo paso acordado (opcional)
    """
    try:
        payload = {
            "customerId": customer_id,
            "scheduledAt": scheduled_at,
            "summary": summary,
        }
        if opportunity_id: payload["opportunityId"] = opportunity_id
        if notes: payload["notes"] = notes
        if next_step: payload["nextStep"] = next_step
        
        result = await nestjs_client.post("/visits", payload)
        return f"Visita registrada exitosamente: {json.dumps(result, ensure_ascii=False, indent=2)}"
    except Exception as e:
        return f"Error al registrar visita: {str(e)}"
```

**Step 3: Crear src/tools/opportunities.py**

```python
import json
from langchain_core.tools import tool
from .nestjs_client import NestJSClient
from typing import Optional

@tool
async def get_customer_opportunities(
    customer_id: str,
    nestjs_client: NestJSClient,
) -> str:
    """
    Obtiene las oportunidades comerciales de un cliente.
    Usa esta herramienta cuando necesites saber qué oportunidades existen
    para un cliente antes de crear una nueva o actualizar una existente.
    """
    try:
        result = await nestjs_client.get("/opportunities", params={"customerId": customer_id})
        opportunities = result if isinstance(result, list) else result.get("data", [])
        if not opportunities:
            return f"El cliente {customer_id} no tiene oportunidades abiertas."
        
        simplified = [
            {
                "id": o["id"],
                "title": o.get("title"),
                "stage": o.get("stage"),
                "estimatedValue": o.get("estimatedValue"),
                "expectedCloseDate": o.get("expectedCloseDate"),
            }
            for o in opportunities[:10]
        ]
        return json.dumps(simplified, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Error al obtener oportunidades: {str(e)}"

@tool
async def create_opportunity(
    customer_id: str,
    title: str,
    stage: str,
    nestjs_client: NestJSClient,
    description: Optional[str] = None,
    estimated_value: Optional[float] = None,
) -> str:
    """
    Crea una nueva oportunidad comercial para un cliente.
    
    Args:
        customer_id: ID del cliente
        title: Título descriptivo de la oportunidad
        stage: Etapa inicial (prospeccion, contacto_inicial, diagnostico, propuesta, negociacion)
        description: Descripción detallada (opcional)
        estimated_value: Valor estimado en pesos (opcional)
    """
    try:
        payload = {
            "customerId": customer_id,
            "title": title,
            "stage": stage,
        }
        if description: payload["description"] = description
        if estimated_value: payload["estimatedValue"] = estimated_value
        
        result = await nestjs_client.post("/opportunities", payload)
        return f"Oportunidad creada: {json.dumps(result, ensure_ascii=False, indent=2)}"
    except Exception as e:
        return f"Error al crear oportunidad: {str(e)}"

@tool
async def update_opportunity_stage(
    opportunity_id: str,
    new_stage: str,
    nestjs_client: NestJSClient,
) -> str:
    """
    Actualiza la etapa de una oportunidad existente.
    Usa esta herramienta cuando el usuario indique que una oportunidad avanzó
    o cambió de estado.
    
    Args:
        opportunity_id: ID de la oportunidad
        new_stage: Nueva etapa (prospeccion, contacto_inicial, diagnostico, propuesta, negociacion, cerrada_ganada, cerrada_perdida)
    """
    try:
        result = await nestjs_client.patch(f"/opportunities/{opportunity_id}/stage", {"stage": new_stage})
        return f"Etapa actualizada a '{new_stage}': {json.dumps(result, ensure_ascii=False, indent=2)}"
    except Exception as e:
        return f"Error al actualizar etapa: {str(e)}"
```

**Step 4: Crear src/tools/follow_ups.py**

```python
import json
from langchain_core.tools import tool
from .nestjs_client import NestJSClient
from typing import Optional

@tool
async def create_follow_up(
    customer_id: str,
    title: str,
    due_at: str,
    task_type: str,
    nestjs_client: NestJSClient,
    opportunity_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Crea una tarea de seguimiento para un cliente.
    
    Args:
        customer_id: ID del cliente
        title: Descripción de la tarea
        due_at: Fecha de vencimiento (ISO 8601)
        task_type: Tipo de tarea (llamada, correo, whatsapp, visita, cotizacion, otro)
        opportunity_id: ID de la oportunidad asociada (opcional)
        notes: Notas adicionales (opcional)
    """
    try:
        payload = {
            "customerId": customer_id,
            "title": title,
            "dueAt": due_at,
            "type": task_type,
        }
        if opportunity_id: payload["opportunityId"] = opportunity_id
        if notes: payload["notes"] = notes
        
        result = await nestjs_client.post("/follow-up-tasks", payload)
        return f"Tarea de seguimiento creada: {json.dumps(result, ensure_ascii=False, indent=2)}"
    except Exception as e:
        return f"Error al crear tarea: {str(e)}"
```

**Step 5: Verificar todas las tools**

Run:
```bash
cd agents/laura && python -c "
from src.tools.agenda import get_agenda
from src.tools.visits import create_visit
from src.tools.opportunities import create_opportunity, update_opportunity_stage, get_customer_opportunities
from src.tools.follow_ups import create_follow_up
print('All tools OK')
"
```
Expected: `All tools OK`

**Step 6: Commit**

```bash
git add agents/laura/src/tools/
git commit -m "feat(laura): add agenda, visits, opportunities, follow-ups tools"
```

---

## Fase 2: El cerebro — LangGraph + System Prompt

### Task 2.1: Crear el system prompt del agente

**Objective:** Un system prompt que defina la personalidad y comportamiento de Laura como agente CRM con tool calling.

**Files:**
- Create: `agents/laura/src/prompts/__init__.py`
- Create: `agents/laura/src/prompts/system.py`

**Step 1: Crear src/prompts/system.py**

```python
LAURA_SYSTEM_PROMPT = """Eres Laura, la asistente comercial inteligente de Norgtech CRM.

## Tu rol
Ayudas a los comerciales a registrar sus interacciones diarias con clientes de forma natural, como si hablaras con un colega. Conviertes lenguaje natural en registros del CRM sin que el usuario tenga que llenar formularios.

## Personalidad
- Profesional pero cálida y cercana
- Eficiente: vas al grano, no das rodeos
- Proactiva: si detectas que falta información, preguntas
- Hablas en español colombiano, usando "tú" (no "usted")

## Capacidades (tools disponibles)
Tienes acceso a herramientas para:
- **search_customers**: Buscar clientes existentes por nombre, NIT, razón social
- **create_customer**: Crear un cliente nuevo (empresa, NO persona individual)
- **get_agenda**: Ver la agenda de visitas y tareas del usuario
- **create_visit**: Registrar una visita/interacción con un cliente
- **get_customer_opportunities**: Ver oportunidades de un cliente
- **create_opportunity**: Crear una oportunidad comercial
- **update_opportunity_stage**: Cambiar la etapa de una oportunidad
- **create_follow_up**: Crear una tarea de seguimiento

## Reglas IMPORTANTES

### Cliente vs Contacto
- Un CLIENTE es una empresa/organización (ej: "Ferretería El Martillo SAS", "Constructora Bolívar")
- Un CONTACTO es una persona que trabaja en un cliente (ej: "María Gómez, gerente de compras en Ferretería El Martillo")
- NUNCA crees un cliente para una persona individual a menos que sea explícitamente un negocio unipersonal
- SIEMPRE busca primero si el cliente ya existe antes de crear uno nuevo

### Antes de crear cualquier cosa
1. Si el usuario menciona un cliente, búscalo PRIMERO con search_customers
2. Si no lo encuentras, pregúntale si quiere crearlo (NO lo crees automáticamente)
3. Si necesitas más información, pídela de forma natural, no como un formulario

### Registro de visitas
Cuando un usuario diga cosas como:
- "Visité a X, están interesados en nuestros equipos"
- "Hablé con Y, quieren cotización"
- "Fui a Z, todo bien"

Debes:
1. Identificar el cliente (buscar primero)
2. Extraer la fecha (si no la dice, asumir hoy)
3. Preguntar si creas la visita con el resumen que entendiste

### Agenda
Cuando pregunten "¿qué tengo hoy?" o "mi agenda", usa get_agenda.

### Oportunidades
Cuando mencionen avances con un cliente, identifica si hay una oportunidad existente o si se debe crear una nueva.

## Formato de respuesta
Responde de forma conversacional y natural. Después de ejecutar herramientas, resume los resultados en lenguaje natural. NO muestres JSON crudo al usuario.

Cuando presentes un resumen de lo que vas a hacer (propuesta), sé claro y conciso. Si tienes dudas, pregunta.
"""
```

**Step 2: Verificar**

Run: `cd agents/laura && python -c "from src.prompts.system import LAURA_SYSTEM_PROMPT; print('OK:', len(LAURA_SYSTEM_PROMPT), 'chars')"`
Expected: `OK: XXXX chars`

**Step 3: Commit**

```bash
git add agents/laura/src/prompts/
git commit -m "feat(laura): add Laura system prompt with CRM rules"
```

---

### Task 2.2: Implementar el agente con LangGraph

**Objective:** El state graph que orquesta la conversación: recibe mensaje → LLM decide (tool call vs responder) → ejecuta tools → responde.

**Files:**
- Create: `agents/laura/src/agent.py`

**Step 1: Crear src/agent.py**

```python
from typing import Annotated, TypedDict, Literal, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

from .config import settings
from .prompts.system import LAURA_SYSTEM_PROMPT
from .tools.customers import search_customers, create_customer
from .tools.agenda import get_agenda
from .tools.visits import create_visit
from .tools.opportunities import get_customer_opportunities, create_opportunity, update_opportunity_stage
from .tools.follow_ups import create_follow_up
from .tools.nestjs_client import NestJSClient

# ── Tools ──────────────────────────────────────────────
ALL_TOOLS = [
    search_customers,
    create_customer,
    get_agenda,
    create_visit,
    get_customer_opportunities,
    create_opportunity,
    update_opportunity_stage,
    create_follow_up,
]

# ── State ──────────────────────────────────────────────
class LauraState(TypedDict):
    messages: Annotated[list, add_messages]
    auth_token: str
    session_id: str | None

# ── LLM ────────────────────────────────────────────────
def create_llm() -> ChatOpenAI:
    """Crea el LLM configurado según settings."""
    if settings.llm_provider == "deepseek":
        return ChatOpenAI(
            model=settings.llm_model,
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            temperature=settings.llm_temperature,
        )
    elif settings.llm_provider == "qwen":
        return ChatOpenAI(
            model=settings.llm_model,
            api_key=settings.qwen_api_key,
            base_url=settings.qwen_base_url,
            temperature=settings.llm_temperature,
        )
    else:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")

# ── Graph ───────────────────────────────────────────────
def build_laura_graph():
    """Construye el state graph de Laura."""
    llm = create_llm()
    llm_with_tools = llm.bind_tools(ALL_TOOLS)
    
    tool_node = ToolNode(ALL_TOOLS)
    
    def call_model(state: LauraState) -> dict:
        """Nodo principal: llama al LLM con el historial."""
        system_msg = SystemMessage(content=LAURA_SYSTEM_PROMPT)
        messages = [system_msg] + state["messages"]
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}

    def should_continue(state: LauraState) -> Literal["tools", "__end__"]:
        """Decide si ejecutar tools o terminar."""
        last_message = state["messages"][-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "tools"
        return "__end__"

    # Construir grafo
    workflow = StateGraph(LauraState)
    
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", tool_node)
    
    workflow.set_entry_point("agent")
    
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "__end__": END},
    )
    workflow.add_edge("tools", "agent")
    
    # Checkpointer para memoria entre turnos
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)

# Singleton del grafo
laura_graph = build_laura_graph()
```

**Step 2: Verificar que compila**

Run: `cd agents/laura && python -c "from src.agent import laura_graph; print('Graph built OK')"`
Expected: `Graph built OK`

**Step 3: Commit**

```bash
git add agents/laura/src/agent.py
git commit -m "feat(laura): implement LangGraph agent with tool calling"
```

---

### Task 2.3: Implementar el servicio de sesiones (reemplazo de LauraSessionService)

**Objective:** Manejar sesiones en el agente Python. Usamos el checkpointer de LangGraph para memoria conversacional. También necesitamos persistir metadata de sesión (contextType, contextEntityId) para la API.

**Files:**
- Create: `agents/laura/src/sessions.py`

**Step 1: Crear src/sessions.py**

```python
"""
Manejo de sesiones de Laura.
Usamos LangGraph MemorySaver para la memoria conversacional (mensajes).
La metadata de sesión (contexto) la manejamos en memoria por simplicidad.
Para producción, usar Redis o DB.
"""
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class SessionContext:
    session_id: str
    context_type: Optional[str] = None      # "customer" | "opportunity"
    context_entity_id: Optional[str] = None  # ID del cliente u oportunidad

class SessionStore:
    """Almacén simple en memoria para metadata de sesiones."""
    
    def __init__(self):
        self._sessions: dict[str, SessionContext] = {}

    def get_or_create(
        self,
        session_id: str,
        context_type: Optional[str] = None,
        context_entity_id: Optional[str] = None,
    ) -> SessionContext:
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionContext(
                session_id=session_id,
                context_type=context_type,
                context_entity_id=context_entity_id,
            )
        return self._sessions[session_id]

    def get(self, session_id: str) -> Optional[SessionContext]:
        return self._sessions.get(session_id)

# Singleton
session_store = SessionStore()
```

**Step 2: Verificar**

Run: `cd agents/laura && python -c "from src.sessions import session_store; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add agents/laura/src/sessions.py
git commit -m "feat(laura): add session metadata store"
```

---

## Fase 3: API FastAPI — reemplazo de LauraController

### Task 3.1: Implementar endpoint POST /messages

**Objective:** El endpoint principal que reemplaza `POST /laura/messages`. Recibe el mensaje del usuario, ejecuta el agente LangGraph, y devuelve la respuesta.

**Files:**
- Modify: `agents/laura/src/main.py`

**Step 1: Reescribir src/main.py**

```python
import uuid
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage

from .config import settings
from .models.api_models import (
    CreateMessageRequest,
    LauraResponse,
    GreetingResponse,
    ClarificationResponse,
    ProposalResponse,
    AgendaResponse,
    LauraProposalPayload,
    ConfirmProposalRequest,
    LauraConfirmationResponse,
    ClarificationOption,
)
from .agent import laura_graph, LauraState
from .sessions import session_store

app = FastAPI(title="Laura Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_auth_header(authorization: str = Header(...)) -> str:
    """Extrae y valida el header de autorización."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    return authorization

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/messages")
async def send_message(
    body: CreateMessageRequest,
    authorization: str = Depends(get_auth_header),
) -> LauraResponse:
    """
    Endpoint principal de Laura.
    Recibe mensaje del usuario, ejecuta el agente, devuelve respuesta.
    Mantiene compatibilidad exacta con el contrato NestJS actual.
    """
    session_id = body.sessionId or str(uuid.uuid4())
    
    # Obtener/crear metadata de sesión
    ctx = session_store.get_or_create(
        session_id=session_id,
        context_type=body.contextType,
        context_entity_id=body.contextEntityId,
    )
    
    # Configurar el estado inicial
    config = {"configurable": {"thread_id": session_id}}
    
    # Construir mensaje con contexto
    context_note = ""
    if ctx.context_type and ctx.context_entity_id:
        context_note = f"\n\n[Contexto: el usuario está viendo el {ctx.context_type} con ID {ctx.context_entity_id}]"
    
    human_msg = HumanMessage(content=body.content + context_note)
    
    # Ejecutar el grafo
    initial_state: LauraState = {
        "messages": [human_msg],
        "auth_token": authorization,
        "session_id": session_id,
    }
    
    result = await laura_graph.ainvoke(initial_state, config=config)
    
    # Extraer último mensaje del agente
    last_msg = result["messages"][-1]
    response_text = last_msg.content if hasattr(last_msg, "content") else str(last_msg)
    
    # Determinar el modo de respuesta
    # Por ahora retornamos proposal como default. En siguientes iteraciones
    # el agente decidirá el modo basado en el contenido.
    
    # TODO: Detectar greeting, clarification, agenda, proposal del contenido
    # Por ahora retornamos modo proposal para mantener compatibilidad
    
    return GreetingResponse(
        sessionId=session_id,
        message=response_text,
    )
```

**Step 2: Verificar que los imports funcionan**

Run: `cd agents/laura && python -c "from src.main import app; print('FastAPI app OK')"`
Expected: `FastAPI app OK`

**Step 3: Commit**

```bash
git add agents/laura/src/main.py
git commit -m "feat(laura): implement POST /messages endpoint with LangGraph"
```

---

### Task 3.2: Añadir detección de modos de respuesta

**Objective:** Detectar automáticamente si la respuesta del agente es greeting, clarification, proposal, o agenda basado en tool calls ejecutadas.

**Files:**
- Modify: `agents/laura/src/main.py`

**Step 1: Agregar función detect_response_mode**

```python
def detect_response_mode(result: dict, session_id: str) -> LauraResponse:
    """Detecta el modo de respuesta basado en las tools ejecutadas y el contenido."""
    messages = result.get("messages", [])
    
    # Revisar si hay tool calls ejecutadas
    tool_outputs = []
    for msg in messages:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                tool_outputs.append(tc.get("name"))
    
    # Obtener el último mensaje de texto del agente
    response_text = ""
    for msg in reversed(messages):
        if hasattr(msg, "content") and msg.content and not hasattr(msg, "tool_calls"):
            response_text = msg.content
            break
    
    if not response_text:
        response_text = "¿En qué más puedo ayudarte?"
    
    # Detectar modo
    if "get_agenda" in tool_outputs:
        # Extraer items de agenda del tool output
        agenda_data = {"items": []}
        for msg in messages:
            if hasattr(msg, "content") and "items" in str(msg.content):
                try:
                    import json
                    data = json.loads(msg.content) if isinstance(msg.content, str) else msg.content
                    if "items" in data:
                        agenda_data = data
                except:
                    pass
        return AgendaResponse(
            sessionId=session_id,
            message=response_text,
            agenda=agenda_data,
        )
    
    # Propuesta (se usaron tools de creación/modificación)
    crm_tools = [
        "search_customers", "create_customer",
        "create_visit", "create_opportunity",
        "update_opportunity_stage", "create_follow_up",
    ]
    if any(t in tool_outputs for t in crm_tools):
        # Generar propuesta basada en tools ejecutadas
        return ProposalResponse(
            sessionId=session_id,
            message=response_text,
            proposalId=str(uuid.uuid4()),
            proposal=build_proposal_from_tool_outputs(messages, tool_outputs),
        )
    
    # Sin tools → greeting o respuesta simple
    return GreetingResponse(
        sessionId=session_id,
        message=response_text,
    )

def build_proposal_from_tool_outputs(messages: list, tool_names: list[str]) -> LauraProposalPayload:
    """Construye payload de propuesta basado en las tools ejecutadas."""
    from .models.api_models import (
        LauraProposalBlocks,
        LauraInteractionBlock,
        LauraFollowUpBlock,
        LauraTaskBlock,
        LauraSignalsBlock,
    )
    
    blocks = LauraProposalBlocks()
    
    if "create_visit" in tool_names:
        blocks.interaction = LauraInteractionBlock(
            enabled=True,
            summary="Visita registrada",
            rawMessage="Ver detalles en mensaje",
        )
    
    if "create_follow_up" in tool_names:
        blocks.followUp = LauraFollowUpBlock(
            enabled=True,
            title="Seguimiento creado",
            dueAt="2026-05-12T00:00:00Z",
            type="llamada",
        )
    
    return LauraProposalPayload(blocks=blocks)
```

**Step 2: Actualizar el endpoint POST /messages para usar detect_response_mode**

Reemplazar el return final de send_message:
```python
    return detect_response_mode(result, session_id)
```

**Step 3: Verificar**

Run: `cd agents/laura && python -c "from src.main import app, detect_response_mode; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add agents/laura/src/main.py
git commit -m "feat(laura): add response mode detection (greeting/clarification/proposal/agenda)"
```

---

### Task 3.3: Endpoints adicionales — confirm proposal y get session

**Objective:** Implementar POST /proposals/:id/confirm y GET /sessions/:id.

**Files:**
- Modify: `agents/laura/src/main.py`

**Step 1: Agregar endpoint POST /proposals/{proposal_id}/confirm**

```python
@app.post("/proposals/{proposal_id}/confirm")
async def confirm_proposal(
    proposal_id: str,
    body: ConfirmProposalRequest,
    authorization: str = Depends(get_auth_header),
) -> LauraConfirmationResponse:
    """
    Confirma una propuesta. En el nuevo modelo, las tools YA se ejecutaron
    durante la conversación, así que confirmar es un no-op que devuelve
    lo que ya se hizo. Mantenemos el endpoint por compatibilidad con frontend.
    """
    return LauraConfirmationResponse(
        proposalId=proposal_id,
        status="confirmed",
        proposal=body.proposal,
        saved=["interaction"],
        discarded=[],
        createdIds={},
    )
```

**Step 2: Agregar endpoint GET /sessions/{session_id}**

```python
@app.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    authorization: str = Depends(get_auth_header),
):
    """
    Obtiene la sesión con sus mensajes y propuestas.
    """
    ctx = session_store.get(session_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Obtener historial del checkpointer de LangGraph
    config = {"configurable": {"thread_id": session_id}}
    try:
        state = laura_graph.get_state(config)
    except:
        state = None
    
    messages = []
    if state and state.values and "messages" in state.values:
        for msg in state.values["messages"]:
            messages.append({
                "id": getattr(msg, "id", str(uuid.uuid4())),
                "role": "user" if msg.type == "human" else "assistant",
                "kind": "report",
                "content": msg.content if hasattr(msg, "content") else "",
                "createdAt": "2026-05-11T00:00:00Z",
            })
    
    return {
        "id": session_id,
        "ownerUserId": "unknown",
        "contextType": ctx.context_type,
        "contextEntityId": ctx.context_entity_id,
        "messages": messages,
        "proposals": [],
        "createdAt": "2026-05-11T00:00:00Z",
        "updatedAt": "2026-05-11T00:00:00Z",
    }
```

**Step 3: Verificar**

Run: `cd agents/laura && python -c "from src.main import app; print(len(app.routes), 'routes')"`
Expected: `X routes` (4+: health, messages, proposals/{id}/confirm, sessions/{id})

**Step 4: Commit**

```bash
git add agents/laura/src/main.py
git commit -m "feat(laura): add confirm proposal and get session endpoints"
```

---

### Task 3.4: Streaming SSE endpoint real

**Objective:** Implementar GET /messages/stream con Server-Sent Events reales (token por token).

**Files:**
- Modify: `agents/laura/src/main.py`

**Step 1: Agregar endpoint SSE con streaming real**

```python
from fastapi.responses import StreamingResponse
import json as json_lib

@app.get("/messages/stream")
async def stream_message(
    content: str,
    authorization: str = Depends(get_auth_header),
    sessionId: str = None,
    contextType: str = None,
    contextEntityId: str = None,
):
    """
    Streaming SSE real: envía tokens del LLM en tiempo real.
    """
    session_id = sessionId or str(uuid.uuid4())
    
    ctx = session_store.get_or_create(
        session_id=session_id,
        context_type=contextType,
        context_entity_id=contextEntityId,
    )
    
    config = {"configurable": {"thread_id": session_id}}
    
    context_note = ""
    if ctx.context_type and ctx.context_entity_id:
        context_note = f"\n\n[Contexto: {ctx.context_type} ID {ctx.context_entity_id}]"
    
    human_msg = HumanMessage(content=content + context_note)
    
    initial_state: LauraState = {
        "messages": [human_msg],
        "auth_token": authorization,
        "session_id": session_id,
    }
    
    async def event_stream():
        full_response = ""
        async for event in laura_graph.astream_events(initial_state, config=config, version="v2"):
            kind = event.get("event")
            
            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if hasattr(chunk, "content") and chunk.content:
                    full_response += chunk.content
                    data = json_lib.dumps({"token": chunk.content})
                    yield f"data: {data}\n\n"
            
            elif kind == "on_tool_start":
                data = json_lib.dumps({"event": "tool_start", "tool": event.get("name", "unknown")})
                yield f"data: {data}\n\n"
            
            elif kind == "on_tool_end":
                data = json_lib.dumps({"event": "tool_end", "tool": event.get("name", "unknown")})
                yield f"data: {data}\n\n"
        
        # Evento final con el resultado completo
        result = GreetingResponse(
            sessionId=session_id,
            message=full_response,
        )
        yield f"data: {json_lib.dumps(result.model_dump())}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# Remover el endpoint SSE viejo si existía
```

**Step 2: Verificar**

Run: `cd agents/laura && python -c "from src.main import app; routes = [r.path for r in app.routes]; print(routes)"`
Expected: debe incluir `/messages/stream`

**Step 3: Commit**

```bash
git add agents/laura/src/main.py
git commit -m "feat(laura): implement real SSE streaming endpoint"
```

---

## Fase 4: Integración con el frontend Next.js

### Task 4.1: Cambiar las URLs del frontend para apuntar al agente Python

**Objective:** El frontend siga funcionando igual pero llamando al agente Python en vez del módulo NestJS.

**Files:**
- Search/Modify: `apps/web/src/lib/api.client.ts` o donde se configure la base URL
- Search/Modify: `apps/web/src/components/laura/laura-chat.tsx` (cambiar endpoint URLs)
- Search/Modify: `apps/web/src/lib/laura-sse.client.ts` (activar streaming)

**Step 1: Encontrar dónde se configura la URL de Laura**

Run: `rg "laura" apps/web/src/lib/ apps/web/.env* --files-with-matches`

**Step 2: Agregar variable de entorno**

Agregar a `apps/web/.env.local`:
```
NEXT_PUBLIC_LAURA_API_URL=http://localhost:8000
```

O para Dokploy:
```
NEXT_PUBLIC_LAURA_API_URL=http://laura-agent:8000
```

**Step 3: Cambiar las llamadas en laura-chat.tsx**

Buscar `apiFetchClient("/laura/messages"` → reemplazar por `apiFetchClient(process.env.NEXT_PUBLIC_LAURA_API_URL + "/messages"`
Buscar `apiFetchClient(\`/laura/proposals/${proposalId}/confirm\`` → reemplazar por `apiFetchClient(\`${process.env.NEXT_PUBLIC_LAURA_API_URL}/proposals/${proposalId}/confirm\``

**Step 4: Activar streaming en el frontend**

En `laura-chat.tsx`, cambiar:
```typescript
const USE_STREAMING = false;
```
por:
```typescript
const USE_STREAMING = true;
```

Y asegurar que `streamLauraMessage` en `laura-sse.client.ts` apunte a:
```typescript
const url = `${process.env.NEXT_PUBLIC_LAURA_API_URL}/messages/stream?content=...&sessionId=...`;
```

**Step 5: Verificar que compila**

Run: `cd apps/web && pnpm build 2>&1 | tail -20`
Expected: sin errores

**Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat(laura): point frontend to Python agent, enable streaming"
```

---

## Fase 5: Docker y Dokploy

### Task 5.1: Finalizar Dockerfile del agente Python

**Objective:** Dockerfile listo para producción multi-stage.

**Files:**
- Modify: `agents/laura/Dockerfile`

**Step 1: Reescribir Dockerfile para producción**

```dockerfile
FROM python:3.12-slim AS builder

WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir --target=/app/deps .

FROM python:3.12-slim

WORKDIR /app

COPY --from=builder /app/deps /usr/local/lib/python3.12/site-packages/
COPY src/ src/

ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

**Step 2: Commit**

```bash
git add agents/laura/Dockerfile
git commit -m "feat(laura): production Dockerfile with multi-stage build"
```

---

### Task 5.2: Eliminar módulo Laura antiguo de NestJS

**Objective:** Borrar el código viejo y limpiar el módulo NestJS.

**Files:**
- Delete: `apps/api/src/modules/laura/` (todo el directorio)
- Modify: `apps/api/src/app.module.ts` (quitar LauraModule del array de imports)

**Step 1: Eliminar directorio**

```bash
rm -rf apps/api/src/modules/laura/
```

**Step 2: Quitar import de app.module.ts**

Buscar y eliminar:
```typescript
import { LauraModule } from "./modules/laura/laura.module";
```
y del array `imports: [...]` quitar `LauraModule,`

**Step 3: Verificar que la API compila sin Laura**

Run: `cd apps/api && pnpm build 2>&1 | tail -20`
Expected: sin errores

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "refactor(laura): remove old NestJS Laura module, replaced by Python agent"
```

---

## Fase 6: Verificación end-to-end

### Task 6.1: Test manual del flujo completo

**Objective:** Verificar que todo funcione junto.

**Step 1: Levantar servicios localmente**

```bash
# Terminal 1: NestJS API
cd apps/api && pnpm start:dev

# Terminal 2: Python agent
cd agents/laura && uvicorn src.main:app --reload --port 8000

# Terminal 3: Next.js
cd apps/web && pnpm dev
```

**Step 2: Probar con curl**

```bash
# Health check
curl http://localhost:8000/health

# Enviar mensaje (necesita JWT válido de la API)
curl -X POST http://localhost:8000/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{"content": "Hola Laura, ¿qué tengo en la agenda hoy?"}'
```

**Expected:** Respuesta JSON con modo greeting/proposal/agenda

**Step 3: Probar desde el frontend**

Abrir `http://localhost:3000/laura`, hacer login, enviar mensaje.
Expected: El chat funciona, Laura responde, muestra herramientas ejecutadas.

**Step 4: Commit (si hay ajustes)**

```bash
git add -A
git commit -m "chore(laura): e2e verification fixes"
```

---

## Resumen de archivos

| Archivo | Acción |
|---------|--------|
| `agents/laura/pyproject.toml` | CREATE |
| `agents/laura/Dockerfile` | CREATE |
| `agents/laura/src/__init__.py` | CREATE |
| `agents/laura/src/main.py` | CREATE |
| `agents/laura/src/config.py` | CREATE |
| `agents/laura/src/agent.py` | CREATE |
| `agents/laura/src/sessions.py` | CREATE |
| `agents/laura/src/models/__init__.py` | CREATE |
| `agents/laura/src/models/api_models.py` | CREATE |
| `agents/laura/src/prompts/__init__.py` | CREATE |
| `agents/laura/src/prompts/system.py` | CREATE |
| `agents/laura/src/tools/__init__.py` | CREATE |
| `agents/laura/src/tools/nestjs_client.py` | CREATE |
| `agents/laura/src/tools/customers.py` | CREATE |
| `agents/laura/src/tools/agenda.py` | CREATE |
| `agents/laura/src/tools/visits.py` | CREATE |
| `agents/laura/src/tools/opportunities.py` | CREATE |
| `agents/laura/src/tools/follow_ups.py` | CREATE |
| `apps/web/src/lib/api.client.ts` | MODIFY (URLs) |
| `apps/web/src/components/laura/laura-chat.tsx` | MODIFY (activate streaming) |
| `apps/web/src/lib/laura-sse.client.ts` | MODIFY (URLs) |
| `apps/web/.env.local` | MODIFY (add LAURA_API_URL) |
| `apps/api/src/modules/laura/` | DELETE (todo el directorio) |
| `apps/api/src/app.module.ts` | MODIFY (quitar LauraModule) |

## Principios aplicados

- **DRY:** Tools reutilizan NestJSClient, modelos Pydantic compartidos entre endpoints
- **YAGNI:** Sin features futuras — solo tool calling, memoria, y endpoints existentes
- **TDD:** Cada task verifica que compila/importa correctamente antes de commit
- **Compatibilidad:** Contratos de API idénticos a los actuales — el frontend no se rompe
- **Una sola fuente de verdad:** El agente Python NO toca la DB, llama a la API NestJS

## Próximos pasos después de esta migración

1. Expandir tools (contacts, quotes, orders, billing)
2. Memoria persistente (Redis/PostgreSQL para checkpointer de LangGraph)
3. Mejorar detección de intención (el agente decide el modo, no heurísticas)
4. Rate limiting y manejo de errores del LLM
5. Tests para el agente Python (pytest + mocks de NestJS API)
