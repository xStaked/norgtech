# Laura UI/UX Redesign — Design Spec

## Overview

Rediseño completo de la interfaz visual del módulo Laura (asistente comercial conversacional del CRM Norgtech). El objetivo es transformar una experiencia fragmentada en dos columnas en un flujo conversacional unificado, moderno y con identidad visual propia.

## Decisions Made

| Decisión | Elección |
|----------|----------|
| Layout | Single-column, propuestas inline en el chat |
| Identidad visual | Moderna conversacional — púrpura/violeta gradient |
| Bloques de propuesta | Header con gradiente púrpura + iconos |
| Estado vacío | Welcome card + 3 ejemplos clickeables |

## Architecture

### Layout General

- **Single-column centrado** con `max-width: 680px` en desktop
- En mobile: full-width con padding lateral de 16px
- Breakpoint: `max-width: 768px` para ajustes responsive
- Fondo de página: `#f8f6ff` (lauraSurface)

### Estructura de la Página

```
┌─────────────────────────────────────────┐
│  Header: [Avatar L] Laura  ● Sesión     │
├─────────────────────────────────────────┤
│                                         │
│  [Empty State — solo primera vez]       │
│     [Avatar 64px]                       │
│     "Hola, soy Laura"                   │
│     [Ejemplo 1] [Ejemplo 2] [Ejemplo 3] │
│                                         │
│  [Mensaje usuario →]                    │
│     [← Mensaje Laura con avatar]        │
│     [← Typing indicator (••• bounce)]   │
│                                         │
│  [← Proposal Card Inline]               │
│     ┌─ Header gradiente: Interacción ─┐ │
│     │ [Toggle] [Textarea resumen]     │ │
│     └─────────────────────────────────┘ │
│     ┌─ Header gradiente: Seguimiento ─┐ │
│     │ [Toggle] [Campos]               │ │
│     └─────────────────────────────────┘ │
│     [Botón Confirmar — full-width]      │
│                                         │
├─────────────────────────────────────────┤
│  [Composer sticky con fade gradient]    │
│  [Textarea ............] [Send button]  │
└─────────────────────────────────────────┘
```

## Sistema Visual

### Paleta de Colores

| Token | Valor | Uso |
|-------|-------|-----|
| `lauraPrimary` | `#6366f1` | Acento principal, toggles, bordes activos, focus rings |
| `lauraPrimaryHover` | `#4f46e5` | Hover states |
| `lauraGradient` | `linear-gradient(135deg, #6366f1, #8b5cf6)` | Headers de bloques, CTA buttons, avatar |
| `lauraSoft` | `rgba(99, 102, 241, 0.08)` | Fondos suaves, inputs inactivos |
| `lauraBorder` | `#e5e1ff` | Bordes de bloques, cards |
| `lauraSurface` | `#f8f6ff` | Fondo de página de Laura |
| `userBubble` | `linear-gradient(135deg, #10233f, #1f4875)` | Burbujas de usuario (CRM existente) |
| `textPrimary` | `#1a1a2e` | Texto principal |
| `textMuted` | `#6b6b80` | Texto secundario, labels |
| `textSubtle` | `#8b8b9e` | Timestamps, placeholders |

### Tipografía

| Elemento | Tamaño | Peso | Color |
|----------|--------|------|-------|
| Título página | 20px | 700 | textPrimary |
| Nombre de bloque | 14px | 600 | white (en header gradiente) |
| Label de campo | 12px | 600 | textSubtle |
| Body de mensajes | 15px | 400 | textPrimary / white |
| Timestamp | 11px | 400 | textSubtle / rgba(255,255,255,0.6) |
| Badge texto | 11px | 700 | según tono |

### Iconografía

Librería: **Lucide React** (ya disponible en el proyecto).

| Contexto | Icono |
|----------|-------|
| Avatar de Laura | `MessageSquare` |
| Bloque Interacción | `MessageSquare` |
| Bloque Oportunidad | `Target` |
| Bloque Seguimiento | `CalendarClock` |
| Bloque Tarea interna | `ClipboardList` |
| Bloque Señales | `Activity` |
| Botón Enviar | `Send` |
| Proposal CTA | `Sparkles` |
| Empty state avatar | `MessageSquare` |
| Typing indicator | 3 dots con animación CSS bounce |

### Componentes Custom

#### Toggle Switch
- Dimensiones: 40x22px
- Thumb: 18px, border-radius 50%
- ON: background `#6366f1`, thumb derecha
- OFF: background `#d4d2e8`, thumb izquierda
- Transición: `all 0.2s ease`

#### Avatar de Laura
- Chat: 20px inline (dentro de burbujas)
- Header: 32px
- Empty state: 64px con `box-shadow: 0 8px 24px rgba(99,102,241,0.25)`
- Fondo: `lauraGradient`, icono blanco

## Componentes Detallados

### 1. LauraPage (page.tsx)

**Cambios:**
- Eliminar SectionCard "Cómo usarla" con 3 tips (se reemplaza por empty state)
- Eliminar InlineMetrics del header (no aportan al usuario)
- PageHeader simplificado: eyebrow "Asistente comercial", título "Laura", descripción corta
- Layout: columna centrada con max-width 680px

### 2. LauraChat (laura-chat.tsx)

**Cambios:**
- Eliminar grid de dos columnas
- Single column layout con `max-width: 680px`, `margin: 0 auto`
- Proposal card se integra como parte del flujo (no panel separado)
- Agregar header fijo con avatar + nombre + badge de sesión
- Composer sticky con gradiente fade de fondo

### 3. LauraMessageList (laura-message-list.tsx)

**Cambios:**
- Eliminar `maxHeight: 520px` — usar `flex: 1` con scroll natural
- Empty state reemplazado por nuevo diseño (ver sección 5)
- Typing indicator: reemplazar `•••` texto por 3 dots animados con CSS bounce animation
- Gap entre mensajes: 12px (reducido de 14px)

### 4. LauraEntryCard (laura-entry-card.tsx)

**Cambios:**
- **Usuario**: mantener gradiente navy, alineación derecha, sin avatar
- **Laura**: fondo blanco, borde `#e5e1ff`, alineación izquierda, agregar avatar pequeño (20px) inline al inicio del contenido
- Border-radius: 16px (reducido de 20px para look más moderno)
- Padding: 12px 16px (reducido de 16px 18px)
- Sombra: más suave `0 2px 8px rgba(99,102,241,0.06)`

### 5. Empty State (nuevo componente)

**Nuevo archivo:** `laura-empty-state.tsx`

**Estructura:**
- Avatar 64px centrado (gradiente púrpura + icono MessageSquare)
- Título: "Hola, soy Laura" (20px bold)
- Subtítulo: "Tu asistente comercial. Contame qué pasó con un cliente y yo armo el registro por vos."
- Label: "Probá con un ejemplo:"
- 3 botones con ejemplos pre-escritos:
  - "Visité a Acme, confirmaron interés y piden nueva visita"
  - "Tengo pendiente llamar a Pérez sobre la propuesta"
  - "¿Qué tengo pendiente hoy?"
- Botones: fondo blanco, borde `#e5e1ff`, hover con borde `#6366f1` + fondo `#f8f6ff`
- Al hacer click: envía el texto y desaparece el empty state

### 6. LauraProposalCard (laura-proposal-card.tsx)

**Cambios:**
- Ya no está envuelto en SectionCard — es un componente inline
- Borde exterior: 2px `#6366f1`, border-radius 16px, fondo blanco
- Header interno: "Propuesta de Laura" con icono Sparkles + badge "Borrador"/"Confirmada"
- Botón confirmar: full-width, gradiente púrpura, sticky al fondo de la card

### 7. LauraProposalBlock (laura-proposal-block.tsx)

**Cambios:**
- Reemplazar checkbox nativo por toggle switch custom
- Header con gradiente púrpura (`#6366f1` → `#8b5cf6`)
- Icono por tipo de bloque (Lucide)
- Padding del header: 12px 16px
- Contenido: padding 14px 16px, fondo blanco
- Bloque desactivado: opacity 0.5, sin gradiente (header gris), campos deshabilitados
- Border-radius: 14px

### 8. LauraComposer (laura-composer.tsx)

**Cambios:**
- Eliminar label "Mensaje para Laura"
- Textarea: borde `#e5e1ff`, focus ring púrpura (`box-shadow: 0 0 0 3px rgba(99,102,241,0.15)`)
- Botón enviar: reemplazar texto por icono `Send` de Lucide
- Botón: 44x44px, cuadrado, gradiente púrpura cuando activo, `#d4d2e8` cuando desactivado
- Hint de caracteres: más compacto, alineado izquierda
- Layout: flex row con textarea (flex:1) + botón enviar

### 9. LauraAgendaCard (laura-agenda-card.tsx)

**Cambios:**
- Agregar iconos por tipo: `MapPin` para visitas, `Phone` para follow-ups
- Badges de prioridad: ajustar colores a paleta púrpura
  - Vencida: `rgba(220,38,38,0.12)` bg, `#dc2626` text
  - Hoy: `rgba(234,179,8,0.12)` bg, `#b45309` text
  - Esta semana: `rgba(99,102,241,0.08)` bg, `#6366f1` text
- Hover effect en items: fondo `#f8f6ff`, cursor pointer
- Border-radius: 12px

### 10. Clarification Options

**Cambios:**
- Reemplazar botones blancos con borde navy por chips con fondo `lauraSoft`
- Borde: 1px `lauraBorder`
- Hover: borde `lauraPrimary`, fondo blanco
- Agregar icono de pregunta `HelpCircle` antes del texto "Selecciona una opción:"

## Animaciones

| Animación | Duración | Uso |
|-----------|----------|-----|
| Typing dots bounce | 1.4s infinite | Indicador de procesamiento |
| Toggle switch slide | 0.2s ease | Activar/desactivar bloques |
| Proposal card appear | 0.3s ease-out | Cuando aparece la propuesta |
| Button hover transition | 0.15s ease | Todos los botones |
| Empty state fade out | 0.2s ease | Al enviar primer mensaje |
| Session badge pulse | 2s infinite | Punto verde de sesión activa |

### Typing Indicator CSS

```css
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}

.typing-dot {
  animation: bounce 1.4s infinite;
}
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
```

## Error Handling

- **Banner de error**: fondo `rgba(220,38,38,0.08)`, borde izquierdo 3px `#dc2626`, icono `AlertCircle`, texto 13px
- **Banner de éxito**: fondo `rgba(34,197,94,0.08)`, borde izquierdo 3px `#22c55e`, icono `CheckCircle`
- **Mensaje con error**: burbuja con borde rojo, botón "Reintentar" con icono `RefreshCw` inline (no separado)
- **Context banner**: fondo `lauraSoft`, borde `lauraBorder`, icono `Info`

## Accessibility

- Focus states visibles en todos los elementos interactivos: `box-shadow: 0 0 0 3px rgba(99,102,241,0.15)`
- Color contrast: todos los textos cumplen WCAG AA (4.5:1 mínimo)
- Toggle switches con `role="switch"` y `aria-checked`
- Botones de ejemplo en empty state con `type="button"`
- Iconos decorativos con `aria-hidden="true"`, iconos funcionales con `aria-label`
- Keyboard navigation: tab order sigue el flujo visual

## File Changes

### Modified Files
- `apps/web/src/app/(app)/laura/page.tsx` — Simplificar header, eliminar tips card
- `apps/web/src/components/laura/laura-chat.tsx` — Single column, header, inline proposal
- `apps/web/src/components/laura/laura-message-list.tsx` — Empty state, typing indicator, scroll
- `apps/web/src/components/laura/laura-entry-card.tsx` — Avatar, border-radius, shadow
- `apps/web/src/components/laura/laura-proposal-card.tsx` — Inline card, gradient border
- `apps/web/src/components/laura/laura-proposal-block.tsx` — Gradient header, toggle switch, icons
- `apps/web/src/components/laura/laura-composer.tsx` — Send icon, focus ring, layout
- `apps/web/src/components/laura/laura-agenda-card.tsx` — Icons, hover, purple palette
- `apps/web/src/components/ui/theme.ts` — Agregar tokens de Laura

### New Files
- `apps/web/src/components/laura/laura-empty-state.tsx` — Welcome + ejemplos clickeables
- `apps/web/src/components/laura/laura-typing-indicator.tsx` — 3 dots animados
- `apps/web/src/components/laura/laura-toggle.tsx` — Toggle switch custom
- `apps/web/src/components/laura/laura-chat-header.tsx` — Header con avatar + sesión

### Removed Concepts
- Two-column grid layout
- SectionCard wrapper para proposal
- Native checkboxes
- Text-based "•••" typing indicator
- InlineMetric de "Modo" y "Persistencia V1" en header

## Dependencies

- **Lucide React**: ya instalado en el proyecto (`lucide-react`)
- **No nuevas dependencias externas**

## Migration Strategy

1. Crear nuevos componentes (Toggle, TypingIndicator, EmptyState, ChatHeader)
2. Agregar tokens de Laura al theme
3. Refactorizar LauraChat para single-column
4. Actualizar cada componente existente incrementalmente
5. Eliminar código muerto (grid layout, SectionCard wrappers)
6. Test visual en desktop y mobile
