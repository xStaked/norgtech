# Nora Chat — Markdown Rendering & Enter-to-Send Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar la UX del chat de Nora agregando (1) renderizado de Markdown en mensajes del asistente y (2) envío con tecla Enter (Shift+Enter para nueva línea).

**Architecture:** Se agrega un componente `NoraMarkdownContent` basado en `react-markdown` que renderiza markdown con estilos inline usando los tokens del `crmTheme`. Se modifica `NoraEntryCard` para usar este componente en mensajes del asistente. Se modifica `NoraComposer` para detectar Enter vs Shift+Enter en el textarea.

**Tech Stack:** React 19, Next.js 16, TypeScript, `react-markdown`, inline styles con crmTheme tokens, Lucide React icons

---

### Task 1: Install react-markdown

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install react-markdown**

Run:
```bash
cd apps/web && pnpm add react-markdown
```

Verify:
```bash
cd apps/web && pnpm ls react-markdown
```
Expected: `react-markdown@<version>` appears in dependency tree

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat(nora): add react-markdown dependency for message rendering"
```

---

### Task 2: Create NoraMarkdownContent component

**Files:**
- Create: `apps/web/src/components/nora/nora-markdown-content.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/nora/nora-markdown-content.tsx`:

```tsx
"use client";

import ReactMarkdown from "react-markdown";
import { crmTheme } from "@/components/ui/theme";

interface NoraMarkdownContentProps {
  content: string;
}

export function NoraMarkdownContent({ content }: NoraMarkdownContentProps) {
  return (
    <ReactMarkdown
      components={{
        p({ children }) {
          return (
            <p
              style={{
                margin: "8px 0",
                fontSize: 15,
                lineHeight: 1.6,
              }}
            >
              {children}
            </p>
          );
        },
        strong({ children }) {
          return (
            <strong style={{ fontWeight: 700 }}>
              {children}
            </strong>
          );
        },
        em({ children }) {
          return (
            <em style={{ fontStyle: "italic" }}>
              {children}
            </em>
          );
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: crmTheme.nora.primary,
                textDecoration: "underline",
                fontWeight: 500,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.textDecoration = "none";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.textDecoration = "underline";
              }}
            >
              {children}
            </a>
          );
        },
        ul({ children }) {
          return (
            <ul
              style={{
                paddingLeft: 20,
                margin: "8px 0",
                listStyleType: "disc",
              }}
            >
              {children}
            </ul>
          );
        },
        ol({ children }) {
          return (
            <ol
              style={{
                paddingLeft: 20,
                margin: "8px 0",
                listStyleType: "decimal",
              }}
            >
              {children}
            </ol>
          );
        },
        li({ children }) {
          return (
            <li
              style={{
                margin: "4px 0",
                lineHeight: 1.6,
                fontSize: 15,
              }}
            >
              {children}
            </li>
          );
        },
        code({ children, className }) {
          const isInline = !className;
          if (isInline) {
            return (
              <code
                style={{
                  background: "rgba(0, 0, 0, 0.05)",
                  padding: "2px 4px",
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily:
                    '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
                }}
              >
                {children}
              </code>
            );
          }
          return (
            <pre
              style={{
                background: "#f4f4f5",
                padding: 12,
                borderRadius: 8,
                overflowX: "auto",
                fontSize: 13,
                fontFamily:
                  '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
                margin: "8px 0",
              }}
            >
              <code>{children}</code>
            </pre>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote
              style={{
                borderLeft: `3px solid ${crmTheme.nora.border}`,
                paddingLeft: 12,
                margin: "8px 0",
                color: crmTheme.nora.textMuted,
                fontStyle: "italic",
              }}
            >
              {children}
            </blockquote>
          );
        },
        h1({ children }) {
          return (
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                margin: "12px 0 8px",
                lineHeight: 1.4,
              }}
            >
              {children}
            </h1>
          );
        },
        h2({ children }) {
          return (
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                margin: "10px 0 6px",
                lineHeight: 1.4,
              }}
            >
              {children}
            </h2>
          );
        },
        h3({ children }) {
          return (
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                margin: "8px 0 4px",
                lineHeight: 1.4,
              }}
            >
              {children}
            </h3>
          );
        },
        hr() {
          return (
            <hr
              style={{
                border: 0,
                borderTop: `1px solid ${crmTheme.nora.border}`,
                margin: "12px 0",
              }}
            />
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/nora/nora-markdown-content.tsx
git commit -m "feat(nora): add NoraMarkdownContent component with inline styles"
```

---

### Task 3: Update NoraEntryCard to render markdown for assistant messages

**Files:**
- Modify: `apps/web/src/components/nora/nora-entry-card.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/components/nora/nora-entry-card.tsx` to confirm its current state.

- [ ] **Step 2: Apply the modifications**

Add the import at the top:

```tsx
import { NoraMarkdownContent } from "./nora-markdown-content";
```

Replace the `<p>` element that renders `message.content` (around line 87–96) with conditional rendering:

```tsx
        {isUser ? (
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {message.content}
          </p>
        ) : (
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.6,
            }}
          >
            <NoraMarkdownContent content={message.content} />
          </div>
        )}
```

Changes:
- User messages stay as plain `<p>` with `whiteSpace: "pre-wrap"`.
- Assistant messages render through `NoraMarkdownContent`.
- The assistant message wrapper is a `<div>` (not `<p>`) to avoid invalid HTML nesting (ReactMarkdown may output `<p>` tags, and `<p>` inside `<p>` is invalid).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/nora/nora-entry-card.tsx
git commit -m "feat(nora): render assistant messages with markdown support"
```

---

### Task 4: Add Enter-to-send and Shift+Enter for newline in NoraComposer

**Files:**
- Modify: `apps/web/src/components/nora/nora-composer.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/src/components/nora/nora-composer.tsx` to confirm its current state.

- [ ] **Step 2: Add the onKeyDown handler**

Add the following handler inside the component (after `handleSubmit`, before the return statement):

```tsx
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        // Programmatically submit the form
        event.currentTarget.form?.requestSubmit();
      }
    }
  }
```

Then add the `onKeyDown` prop to the `<textarea>` element:

```tsx
        <textarea
          id="nora-message"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          // ... rest of props unchanged
        />
```

Changes:
- `Enter` alone: prevents default (avita nueva línea) y envía el formulario si `canSend` es true.
- `Shift+Enter`: comportamiento nativo del textarea (inserta nueva línea).
- Usa `requestSubmit()` para que el `<form onSubmit={handleSubmit}>` maneje la validación y el submit de forma unificada.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/nora/nora-composer.tsx
git commit -m "feat(nora): add Enter-to-send and Shift+Enter for newline in composer"
```

---

### Task 5: Verify everything works

- [ ] **Step 1: Run TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run linter**

```bash
cd apps/web && pnpm lint
```

Expected: No lint errors.

- [ ] **Step 3: Manual verification checklist**

1. Start the dev server: `pnpm dev:web`
2. Open the Nora chat.
3. Send a message as user — should appear as plain text.
4. Receive (or mock) an assistant message with markdown:
   ```
   Hoy tienes programada una visita:

   - **Inspección de cuartos fríos existentes**: Se identificaron 3 compresores para reemplazo. Está programada para las 3:00 PM.

   Si necesitas más detalles, **házmelo saber**.
   ```
5. Confirm: the bold text (`**...**`) renders as `<strong>` with bold weight.
6. Confirm: the list item renders with a bullet and proper indentation.
7. Confirm: links render as underlined, colored anchor tags.
8. In the composer: type a message and press `Enter` — it should send.
9. In the composer: type a message, press `Shift+Enter` — it should insert a newline.
10. Confirm: the send button still works when clicked.
11. Confirm: validation (min 5 chars) still works on Enter.

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "feat(nora): markdown rendering & enter-to-send — phase complete"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `apps/web/package.json` | Add `react-markdown` dependency |
| `apps/web/src/components/nora/nora-markdown-content.tsx` | **New** — Markdown renderer with inline styles |
| `apps/web/src/components/nora/nora-entry-card.tsx` | Use `NoraMarkdownContent` for assistant messages |
| `apps/web/src/components/nora/nora-composer.tsx` | Add `Enter` to send, `Shift+Enter` for newline |
