# Nora Chat — Markdown Rendering & Enter-to-Send Design Spec

## Overview

Mejoras de UX en el chat conversacional de Nora (asistente comercial). El bot retorna respuestas en formato Markdown (negritas, listas, links) pero el frontend las renderiza como texto plano. Además, el composer no soporta enviar con la tecla `Enter`, forzando al usuario a hacer click en el icono de enviar.

**Objetivo:**
1. Renderizar Markdown en los mensajes del asistente con estilos coherentes al tema actual.
2. Permitir enviar mensajes con `Enter` y nueva línea con `Shift+Enter`.

---

## Decisions Made

| Decisión | Elección |
|----------|----------|
| Parser Markdown | `react-markdown` — estándar en React, safe (no `dangerouslySetInnerHTML`), permite custom renderers con estilos inline |
| Elementos soportados | Bold, italic, listas (ul/ol), links, code inline, code blocks, blockquotes, saltos de línea |
| Mensajes de usuario | Se mantienen como texto plano (no esperamos markdown del usuario) |
| Tecla Enter | Envía el mensaje si tiene contenido válido |
| Shift+Enter | Inserta nueva línea en el textarea |
| Tecla Enter vacío o inválido | No hace nada (igual que el botón deshabilitado) |

---

## Architecture

### Flujo de Renderizado de Mensajes

```
┌─────────────────────────────────────────┐
│  NoraEntryCard                          │
│  ├─ Header (avatar, nombre, hora)       │
│  ├─ Content                             │
│  │   ├─ Usuario: <p> texto plano </p>   │
│  │   └─ Asistente: <NoraMarkdownContent> │
│  │       ├─ react-markdown parser       │
│  │       ├─ Custom renderers (inline)   │
│  │       └─ Estilos con crmTheme tokens  │
│  └─ Timestamp                           │
└─────────────────────────────────────────┘
```

### Flujo de Input

```
┌─────────────────────────────────────────┐
│  NoraComposer                           │
│  ├─ <textarea>                          │
│  │   ├─ onKeyDown: detect Enter         │
│  │   │   ├─ Sin Shift → handleSubmit    │
│  │   │   └─ Con Shift → newline nativo  │
│  │   └─ onChange: actualiza estado      │
│  ├─ <button type="submit"> Send icon    │
│  └─ Length hint                         │
└─────────────────────────────────────────┘
```

---

## Sistema Visual

### Markdown Styles

Todos los estilos usan inline styles con tokens del `crmTheme` existente para mantener consistencia.

| Elemento | Estilo |
|----------|--------|
| **Bold** (`<strong>`) | `fontWeight: 700`, hereda color del mensaje |
| *Italic* (`<em>`) | `fontStyle: "italic"`, hereda color |
| Link (`<a>`) | `color: crmTheme.nora.primary`, `textDecoration: "underline"`, hover `textDecoration: "none"` |
| Lista (`<ul>`) | `paddingLeft: 20`, `margin: "8px 0"` |
| Lista ordenada (`<ol>`) | `paddingLeft: 20`, `margin: "8px 0"` |
| Item de lista (`<li>`) | `margin: "4px 0"`, `lineHeight: 1.6` |
| Code inline (`<code>`) | `background: "rgba(0,0,0,0.05)"`, `padding: "2px 4px"`, `borderRadius: 4`, `fontSize: 13`, `fontFamily: monospace` |
| Code block (`<pre>`) | `background: "#f4f4f5"`, `padding: 12`, `borderRadius: 8`, `overflowX: "auto"`, `fontSize: 13` |
| Blockquote (`<blockquote>`) | `borderLeft: "3px solid #e5e1ff"`, `paddingLeft: 12`, `margin: "8px 0"`, `color: crmTheme.nora.textMuted` |
| Párrafo (`<p>`) | `margin: "8px 0"`, primera y última `margin: 0` |
| Salto de línea | Preservado vía `whiteSpace: "pre-wrap"` en el contenedor |

### Estilos por Rol

- **Usuario**: texto plano, color `#ffffff`, no aplica markdown.
- **Asistente (Laura)**: markdown renderizado, color `crmTheme.nora.textPrimary`.

---

## Componentes Detallados

### 1. NoraMarkdownContent (nuevo)

**Nuevo archivo:** `apps/web/src/components/nora/nora-markdown-content.tsx`

Responsabilidad: recibir un string con markdown y retornar elementos React renderizados con estilos inline.

- Usa `react-markdown` como parser.
- Proporciona `components` prop con renderers custom que aplican estilos inline.
- No añade wrappers adicionales — el contenedor de estilos queda en `NoraEntryCard`.

### 2. NoraEntryCard (modificación)

**Archivo:** `apps/web/src/components/nora/nora-entry-card.tsx`

Cambios:
- Importar `NoraMarkdownContent`.
- Para mensajes del asistente: reemplazar `<p>{message.content}</p>` por `<NoraMarkdownContent content={message.content} />`.
- Para mensajes de usuario: mantener texto plano.
- Ajustar el contenedor para que `whiteSpace: "pre-wrap"` no interfiera con los elementos de lista de react-markdown.

### 3. NoraComposer (modificación)

**Archivo:** `apps/web/src/components/nora/nora-composer.tsx`

Cambios:
- Agregar `onKeyDown` handler en el `<textarea>`.
- Detectar `e.key === "Enter"`:
  - Si `!e.shiftKey`: `e.preventDefault()` y llamar `handleSubmit()`.
  - Si `e.shiftKey`: comportamiento nativo (nueva línea).
- El submit por formulario y botón siguen funcionando igual.

---

## Accessibility

- Links con `target="_blank"` y `rel="noopener noreferrer"` para seguridad.
- Code blocks con `aria-label="Code snippet"` para lectores de pantalla.
- Focus states: se mantienen los existentes en textarea y botón.
- Enter-to-send: comportamiento estándar en chat interfaces, reduce fricción.
- Shift+Enter: descubierto y esperado por usuarios avanzados para multilínea.

---

## Dependencies

- **`react-markdown`** — parser de Markdown para React. No requiere `dangerouslySetInnerHTML`.
  - Tamaño: ~40KB minzipped (con sus dependencias).
  - Alternativa considerada: `marked` + `dangerouslySetInnerHTML` — rechazada por seguridad y peor experiencia con renderers custom.

---

## File Changes

### Modified Files
- `apps/web/src/components/nora/nora-entry-card.tsx` — usar NoraMarkdownContent para mensajes del asistente
- `apps/web/src/components/nora/nora-composer.tsx` — agregar onKeyDown con Enter/Shift+Enter
- `apps/web/package.json` — agregar `react-markdown`

### New Files
- `apps/web/src/components/nora/nora-markdown-content.tsx` — componente de renderizado markdown

---

## Acceptance Criteria

- [ ] Los mensajes del asistente que contienen `**texto**` se renderizan en negrita.
- [ ] Las listas con `- item` o `1. item` se renderizan como `<ul>` / `<ol>` con viñetas/numeración.
- [ ] Los links `[texto](url)` se renderizan como `<a>` clickeables.
- [ ] El code inline `` `código` `` se renderiza con fondo gris claro.
- [ ] Los mensajes de usuario siguen siendo texto plano.
- [ ] Presionar `Enter` en el textarea envía el mensaje si cumple la validación (mínimo 5 caracteres).
- [ ] Presionar `Shift+Enter` inserta una nueva línea en el textarea.
- [ ] El botón de enviar sigue funcionando como antes.
- [ ] No hay errores de TypeScript ni de lint.
