# Requirements: Norgtech Platform

**Defined:** 2026-03-13
**Core Value:** Dar a Norgtech y a cada productor una vista operativa clara, accionable y segura de su operación por unidad productiva.

## v1 Requirements

### Platform Core

- [ ] **CORE-01**: La plataforma debe operar con dos experiencias separadas por rol: panel interno y portal productor.
- [ ] **CORE-02**: Todo endpoint y vista debe respetar aislamiento por organización y por recursos asignados al usuario autenticado.

### Admin CRM

- [ ] **CRM-01**: El equipo interno puede gestionar productores.
- [ ] **CRM-02**: El equipo interno puede gestionar granjas o predios asociados a cada productor.
- [ ] **CRM-03**: El equipo interno puede gestionar casos técnicos, visitas y calculadoras por productor o granja.

### Producer Portal

- [ ] **PORT-01**: El productor puede acceder a un dashboard de su operación.
- [ ] **PORT-02**: El productor puede consultar casos, visitas y granjas asociadas.
- [x] **PORT-03**: El portal productor debe evolucionar a una navegación persistente tipo sidebar.
- [ ] **PORT-04**: El productor puede registrar y administrar sus granjas o unidades equivalentes.
- [ ] **PORT-05**: El productor puede registrar galpones, naves o la unidad operativa equivalente para porcino.
- [ ] **PORT-06**: El productor dispone de módulos de reportes, registros, analíticas, ventas, alertas y calculadoras.

### Swine Domain

- [ ] **SWINE-01**: El dominio debe soportar operaciones porcinas además de avícolas.
- [ ] **SWINE-02**: Las etiquetas, formularios y navegación deben adaptarse a terminología por especie.
- [ ] **SWINE-03**: La estructura operativa debe admitir jerarquía productor -> granja/predio -> galpón o equivalente.

## v2 Requirements

### Automation

- **AUTO-01**: Generar alertas automáticas basadas en desviaciones operativas por galpón.
- **AUTO-02**: Recomendar acciones con IA dentro del workspace productor.

## Out of Scope

| Feature | Reason |
|---------|--------|
| App móvil nativa | Web responsive es suficiente para la etapa actual |
| Integraciones ERP externas | No son necesarias para abrir el portal operativo productor |
| Reemplazo del panel admin actual | El foco es ampliar el portal productor sin rehacer lo ya entregado |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 0 | Complete |
| CORE-02 | Phase 2 | Complete |
| CRM-01 | Phase 2 | Complete |
| CRM-02 | Phase 2 | Complete |
| CRM-03 | Phase 3/4/5 | Complete |
| PORT-01 | Phase 7 | Complete |
| PORT-02 | Phase 7 | Complete |
| PORT-03 | Phase 7.1 | Complete |
| PORT-04 | Phase 7.1 | Pending |
| PORT-05 | Phase 7.1 | Pending |
| PORT-06 | Phase 7.1 | Pending |
| SWINE-01 | Phase 1/2 | Complete |
| SWINE-02 | Phase 7.1 | Pending |
| SWINE-03 | Phase 7.1 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after GSD bootstrap and phase 7.1 scoping*
