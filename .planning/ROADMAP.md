# Norgtech Platform — Roadmap de Implementación

> SaaS vertical para el sector avícola y porcino.
> Plataforma interna para Norgtech: gestión de productores, casos técnicos, visitas, calculadoras y AI.

---

## Fases de Implementación

### FASE 0 — Monorepo setup y configuración base
**Objetivo:** Estructura del monorepo lista, NestJS bootstrapped, Prisma conectado.
**Estado:** Existente

### FASE 1 — Schema de base de datos
**Objetivo:** Schema Prisma completo del nuevo dominio. Migraciones aplicadas.
**Estado:** Existente

### FASE 2 — NestJS Core Modules (Auth + Tenant + Clients + Farms)
**Objetivo:** API base multi-tenant para productores y granjas.
**Estado:** Existente

### FASE 3 — Módulo de Casos Técnicos
**Objetivo:** Gestión de casos técnicos para productores.
**Estado:** Existente

### FASE 4 — Módulo de Visitas Técnicas
**Objetivo:** Registro y seguimiento de visitas.
**Estado:** Existente

### FASE 5 — Calculadoras Técnicas
**Objetivo:** FCA, ROI y simulador productivo.
**Estado:** Existente

### FASE 6 — Dashboards
**Objetivo:** KPIs y métricas en tiempo real para admin y asesores.
**Estado:** Existente

### FASE 7 — Portal del Cliente
**Objetivo:** Portal de autoservicio para que los productores vean sus casos y granja.
**Estado:** Existente

### FASE 7.1 — Portal Operativo del Productor
**Objetivo:** Evolucionar el portal productor desde consulta básica a workspace operativo con sidebar persistente, estructura por granja/galpón y módulos de operación.
**Dependencias:** Fases 2, 4, 5, 6, 7

**Progreso de planes:** 2/5 completados

| Plan | Estado | Resumen |
|------|--------|---------|
| 07.1-01 | Completado | Ownership productor explícito y jerarquía `farm -> operating unit` en backend |
| 07.1-02 | Pendiente | Sin ejecutar |
| 07.1-03 | Completado | Shell persistente con sidebar y migración canónica de rutas `cases` / `farms` |
| 07.1-04 | Pendiente | Sin ejecutar |
| 07.1-05 | Pendiente | Sin ejecutar |

#### Alcance

- Reemplazar el header simple del portal por un shell con sidebar persistente, navegación modular y adaptación responsive.
- Incorporar navegación para `Resumen`, `Granjas`, `Galpones`, `Reportes`, `Registros`, `Analíticas`, `Ventas`, `Alertas`, `Calculadoras` y `Configuración`.
- Permitir que el productor registre granjas o la unidad principal equivalente.
- Introducir una nueva entidad hija de `farm` para representar `galpones` o el equivalente porcino, con soporte para terminología por especie.
- Reestructurar el dashboard del productor para trabajar por unidad productiva y no solo por vista agregada.
- Definir endpoints, DTOs y permisos para lectura y escritura acotada del productor autenticado sobre sus recursos.
- Preparar vistas iniciales y estados vacíos para reportes, registros, analíticas, ventas y alertas.

#### Resultado esperado

El productor entra a un panel con estructura de trabajo real, puede organizar su operación por granja y galpón, y ve una base lista para captura de registros, seguimiento, análisis y ventas.

### FASE 8 — Base de Conocimiento
**Objetivo:** Repositorio de documentación técnica para asesores + consulta por AI.
**Estado:** Existente en roadmap

### FASE 9 — Asistente AI (DeepSeek)
**Objetivo:** Asistente AI interno para soporte técnico y operativo.
**Estado:** Existente en roadmap
