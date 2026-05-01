# Laura UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Laura virtual assistant module from a two-column split layout into a single-column conversational interface with purple/violet brand identity, inline proposal cards, animated typing indicator, custom toggle switches, and a welcome empty state with clickable examples.

**Architecture:** Single-column centered layout (max-width 680px) where proposal cards appear inline within the message flow. New utility components (Toggle, TypingIndicator, EmptyState, ChatHeader) are extracted as focused files. Existing components are refactored incrementally while preserving all backend contracts and type definitions.

**Tech Stack:** React 19, Next.js 16, TypeScript, inline styles with crmTheme tokens, Lucide React icons

---

### Task 1: Install lucide-react and add Laura theme tokens

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/components/ui/theme.ts`

- [ ] **Step 1: Install lucide-react**

Run:
```bash
cd apps/web && npm install lucide-react
```

Verify:
```bash
cd apps/web && npm ls lucide-react
```
Expected: `lucide-react@<version>` appears in dependency tree

- [ ] **Step 2: Add Laura tokens to theme.ts**

Read `apps/web/src/components/ui/theme.ts` and add the `laura` section to the `crmTheme` object before the closing `as const;`:

```typescript
// Add inside crmTheme object, after the `motion` block:
  laura: {
    primary: "#6366f1",
    primaryHover: "#4f46e5",
    gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    soft: "rgba(99, 102, 241, 0.08)",
    border: "#e5e1ff",
    surface: "#f8f6ff",
    textPrimary: "#1a1a2e",
    textMuted: "#6b6b80",
    textSubtle: "#8b8b9e",
    shadow: "0 2px 8px rgba(99,102,241,0.06)",
    shadowFloating: "0 8px 24px rgba(99,102,241,0.25)",
    focusRing: "0 0 0 3px rgba(99,102,241,0.15)",
  },
```

Also add the spacing token for chat:
```typescript
// Add inside the `spacing` block:
    chat: "12px",
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/src/components/ui/theme.ts apps/web/package-lock.json
git commit -m "feat(laura): add lucide-react dependency and laura theme tokens"
```

---

### Task 2: Create LauraToggle component

**Files:**
- Create: `apps/web/src/components/laura/laura-toggle.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/laura/laura-toggle.tsx`:

```tsx
"use client";

import { crmTheme } from "@/components/ui/theme";

interface LauraToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

export function LauraToggle({ checked, onChange, disabled, label }: LauraToggleProps) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        fontWeight: 700,
        color: checked ? crmTheme.colors.text : crmTheme.colors.textMuted,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        role="switch"
        aria-checked={checked}
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: checked ? crmTheme.laura.primary : "#d4d2e8",
          position: "relative",
          transition: "background 0.2s ease",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#ffffff",
            position: "absolute",
            top: 2,
            left: checked ? 20 : 2,
            transition: "left 0.2s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </div>
      Guardar
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-toggle.tsx
git commit -m "feat(laura): add LauraToggle custom switch component"
```

---

### Task 3: Create LauraTypingIndicator component

**Files:**
- Create: `apps/web/src/components/laura/laura-typing-indicator.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/laura/laura-typing-indicator.tsx`:

```tsx
"use client";

import { crmTheme } from "@/components/ui/theme";

export function LauraTypingIndicator() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: "20px 20px 20px 6px",
        background: crmTheme.colors.surface,
        border: `1px solid ${crmTheme.laura.border}`,
        color: crmTheme.colors.textMuted,
        fontSize: 13,
        fontWeight: 600,
        width: "fit-content",
      }}
    >
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <span
          className="laura-typing-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: crmTheme.laura.primary,
            animation: "lauraBounce 1.4s infinite",
          }}
        />
        <span
          className="laura-typing-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: crmTheme.laura.primary,
            animation: "lauraBounce 1.4s infinite",
            animationDelay: "0.2s",
          }}
        />
        <span
          className="laura-typing-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: crmTheme.laura.primary,
            animation: "lauraBounce 1.4s infinite",
            animationDelay: "0.4s",
          }}
        />
      </div>
      Laura está procesando
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-typing-indicator.tsx
git commit -m "feat(laura): add LauraTypingIndicator with bounce animation"
```

---

### Task 4: Create LauraEmptyState component

**Files:**
- Create: `apps/web/src/components/laura/laura-empty-state.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/laura/laura-empty-state.tsx`:

```tsx
"use client";

import { MessageSquare } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

const exampleMessages = [
  "Visité a Acme, confirmaron interés y piden nueva visita",
  "Tengo pendiente llamar a Pérez sobre la propuesta",
  "¿Qué tengo pendiente hoy?",
];

interface LauraEmptyStateProps {
  onSend: (message: string) => void;
}

export function LauraEmptyState({ onSend }: LauraEmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: crmTheme.laura.gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: crmTheme.laura.shadowFloating,
        }}
      >
        <MessageSquare size={32} color="#ffffff" strokeWidth={2} />
      </div>

      <div style={{ textAlign: "center" }}>
        <h3
          style={{
            margin: "0 0 4px",
            fontSize: 20,
            fontWeight: 700,
            color: crmTheme.laura.textPrimary,
          }}
        >
          Hola, soy Laura
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: crmTheme.laura.textMuted,
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          Tu asistente comercial. Contame qué pasó con un cliente y yo armo el registro por vos.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 360, display: "grid", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: crmTheme.laura.textSubtle,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Probá con un ejemplo:
        </span>
        {exampleMessages.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onSend(example)}
            style={{
              padding: "10px 14px",
              background: crmTheme.colors.surface,
              border: `1px solid ${crmTheme.laura.border}`,
              borderRadius: 10,
              textAlign: "left",
              fontSize: 13,
              color: crmTheme.laura.textMuted,
              cursor: "pointer",
              transition: "all 0.15s ease",
              fontFamily: crmTheme.typography.body,
              lineHeight: 1.4,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = crmTheme.laura.primary;
              e.currentTarget.style.background = crmTheme.laura.surface;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = crmTheme.laura.border;
              e.currentTarget.style.background = crmTheme.colors.surface;
            }}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-empty-state.tsx
git commit -m "feat(laura): add LauraEmptyState with welcome card and clickable examples"
```

---

### Task 5: Create LauraChatHeader component

**Files:**
- Create: `apps/web/src/components/laura/laura-chat-header.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/laura/laura-chat-header.tsx`:

```tsx
"use client";

import { MessageSquare } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

interface LauraChatHeaderProps {
  hasActiveSession: boolean;
}

export function LauraChatHeader({ hasActiveSession }: LauraChatHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: crmTheme.colors.surface,
        borderRadius: crmTheme.radius.lg,
        border: `1px solid ${crmTheme.colors.border}`,
        boxShadow: crmTheme.shadow.card,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: crmTheme.laura.gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MessageSquare size={18} color="#ffffff" strokeWidth={2} />
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: crmTheme.laura.textPrimary }}>
          Laura
        </span>
        <span style={{ fontSize: 12, color: crmTheme.laura.textMuted }}>
          Asistente comercial
        </span>
      </div>
      <div style={{ marginLeft: "auto" }}>
        {hasActiveSession ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: crmTheme.colors.success,
              background: "rgba(31, 143, 95, 0.08)",
              padding: "4px 10px",
              borderRadius: crmTheme.radius.pill,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: crmTheme.colors.success,
                animation: "lauraPulse 2s infinite",
              }}
            />
            Sesión activa
          </span>
        ) : (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: crmTheme.colors.textMuted,
              background: crmTheme.colors.surfaceMuted,
              padding: "4px 10px",
              borderRadius: crmTheme.radius.pill,
            }}
          >
            Sin sesión
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-chat-header.tsx
git commit -m "feat(laura): add LauraChatHeader with avatar and session badge"
```

---

### Task 6: Add global CSS animations for Laura

**Files:**
- Modify: `apps/web/src/app/(app)/laura/page.tsx` (add style tag)

- [ ] **Step 1: Add CSS keyframes to the Laura page**

Read `apps/web/src/app/(app)/laura/page.tsx` and add a `<style>` tag inside the main container div (after the opening `<div style={{ display: "grid", gap: 24 }}>`):

```tsx
<style>{`
  @keyframes lauraBounce {
    0%, 80%, 100% { transform: translateY(0); }
    40% { transform: translateY(-6px); }
  }
  @keyframes lauraPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`}</style>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/laura/page.tsx
git commit -m "feat(laura): add global CSS keyframe animations"
```

---

### Task 7: Refactor LauraPage — simplify header, remove tips card

**Files:**
- Modify: `apps/web/src/app/(app)/laura/page.tsx`

- [ ] **Step 1: Rewrite the page component**

Replace the entire page content with:

```tsx
import { redirect } from "next/navigation";
import { LauraChat } from "@/components/laura/laura-chat";
import { PageHeader } from "@/components/ui/page-header";
import { canAccess } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth.server";

export default async function LauraPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const role = user?.role ?? null;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!canAccess(role, "/laura")) {
    redirect("/dashboard");
  }

  const contextTypeRaw = resolvedSearchParams?.contextType;
  const contextEntityIdRaw = resolvedSearchParams?.contextEntityId;
  const contextLabelRaw = resolvedSearchParams?.contextLabel;

  const initialContext: {
    contextType: "customer" | "opportunity";
    contextEntityId: string;
    contextLabel: string | null;
  } | null =
    typeof contextTypeRaw === "string" &&
    (contextTypeRaw === "customer" || contextTypeRaw === "opportunity") &&
    typeof contextEntityIdRaw === "string" &&
    contextEntityIdRaw.trim().length > 0
      ? {
          contextType: contextTypeRaw,
          contextEntityId: contextEntityIdRaw,
          contextLabel: typeof contextLabelRaw === "string" ? contextLabelRaw : null,
        }
      : null;

  return (
    <div style={{ display: "grid", gap: 24, maxWidth: 680, margin: "0 auto", width: "100%" }}>
      <PageHeader
        eyebrow="Asistente comercial"
        title="Laura"
        description="Conversá en lenguaje natural y Laura arma los registros por vos."
      />

      <LauraChat initialContext={initialContext} />

      <style>{`
        @keyframes lauraBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes lauraPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
```

Changes:
- Removed `InlineMetric` imports and usage
- Removed `SectionCard` "Cómo usarla" with 3 tips
- Removed the `Tip` component entirely
- Added `maxWidth: 680, margin: "0 auto"` to center the layout
- Simplified description text

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/laura/page.tsx
git commit -m "refactor(laura): simplify page header, remove tips card, center layout"
```

---

### Task 8: Refactor LauraEntryCard — add avatar, update styling

**Files:**
- Modify: `apps/web/src/components/laura/laura-entry-card.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file content with:

```tsx
"use client";

import { MessageSquare } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import type { LauraMessageItem } from "./laura-types";

function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Ahora";
  }

  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const roleCopy: Record<LauraMessageItem["role"], string> = {
  user: "Tú",
  assistant: "Laura",
  system: "Sistema",
};

export function LauraEntryCard({ message }: { message: LauraMessageItem }) {
  const isUser = message.role === "user";

  return (
    <article
      style={{
        display: "grid",
        justifyItems: isUser ? "end" : "start",
      }}
    >
      <div
        style={{
          width: "min(100%, 680px)",
          display: "grid",
          gap: 6,
          padding: "12px 16px",
          borderRadius: 16,
          border: `1px solid ${isUser ? "transparent" : crmTheme.laura.border}`,
          background: isUser
            ? "linear-gradient(135deg, #10233f 0%, #1f4875 100%)"
            : crmTheme.colors.surface,
          boxShadow: isUser ? "none" : crmTheme.laura.shadow,
          color: isUser ? "#ffffff" : crmTheme.laura.textPrimary,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isUser && (
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: crmTheme.laura.gradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <MessageSquare size={12} color="#ffffff" strokeWidth={2.5} />
              </div>
            )}
            <strong style={{ fontSize: 12, fontWeight: 700 }}>{roleCopy[message.role]}</strong>
          </div>
          <span
            style={{
              fontSize: 11,
              color: isUser ? "rgba(255, 255, 255, 0.6)" : crmTheme.laura.textSubtle,
            }}
          >
            {formatMessageTime(message.createdAt)}
          </span>
        </div>
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
      </div>
    </article>
  );
}
```

Changes:
- Added `MessageSquare` icon from lucide-react for Laura's avatar
- Reduced border-radius from 20px to 16px
- Reduced padding from 16px 18px to 12px 16px
- Added Laura avatar (20px square with rounded corners) inline for assistant messages
- Updated shadow to `laura.shadow`
- Updated max-width to 680px
- Updated timestamp color to use laura tokens

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-entry-card.tsx
git commit -m "refactor(laura): add avatar icon, update entry card styling"
```

---

### Task 9: Refactor LauraMessageList — integrate new components

**Files:**
- Modify: `apps/web/src/components/laura/laura-message-list.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file content with:

```tsx
"use client";

import { crmTheme } from "@/components/ui/theme";
import { LauraEmptyState } from "./laura-empty-state";
import { LauraEntryCard } from "./laura-entry-card";
import { LauraTypingIndicator } from "./laura-typing-indicator";
import type { LauraMessageItem } from "./laura-types";
import { useAutoScroll } from "@/hooks/use-auto-scroll";

export function LauraMessageList({
  messages,
  busy,
  onRetry,
  onSend,
}: {
  messages: LauraMessageItem[];
  busy: boolean;
  onRetry?: (content: string) => void;
  onSend: (content: string) => void;
}) {
  const scrollRef = useAutoScroll(messages.length + (busy ? 1 : 0));

  if (messages.length === 0) {
    return <LauraEmptyState onSend={onSend} />;
  }

  return (
    <div style={{ display: "grid", gap: crmTheme.spacing.chat }}>
      {messages.map((message) => (
        <LauraEntryCard key={message.id} message={message} />
      ))}
      {messages
        .filter((message) => message.status === "error" && onRetry)
        .map((message) => (
          <button
            key={`retry-${message.id}`}
            type="button"
            onClick={() => onRetry!(message.content)}
            style={{
              appearance: "none",
              border: `1px solid ${crmTheme.colors.danger}`,
              borderRadius: crmTheme.radius.md,
              padding: "6px 14px",
              background: "rgba(186, 58, 47, 0.08)",
              color: crmTheme.colors.danger,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              width: "fit-content",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Reintentar
          </button>
        ))}
      {busy && <LauraTypingIndicator />}
      <div ref={scrollRef} />
    </div>
  );
}
```

Changes:
- Replaced `EmptyState` import with `LauraEmptyState`
- Replaced text-based typing indicator with `LauraTypingIndicator`
- Added `onSend` prop for empty state callbacks
- Removed `maxHeight: 520px` and `overflowY: auto` — scroll is now handled by parent
- Updated gap to use `crmTheme.spacing.chat`
- Updated retry button styling with border and soft background

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-message-list.tsx
git commit -m "refactor(laura): integrate empty state and typing indicator components"
```

---

### Task 10: Refactor LauraComposer — send icon, focus ring, layout

**Files:**
- Modify: `apps/web/src/components/laura/laura-composer.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file content with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

const MIN_LENGTH = 5;

const placeholderExamples = [
  "Ejemplo: Visité a Acme, confirmaron interés y piden nueva visita",
  "Ejemplo: Tengo pendiente llamar a Pérez sobre la propuesta",
  "Ejemplo: Qué tengo pendiente hoy?",
  "Ejemplo: El cliente Lago quiere cotización para el próximo viernes",
  "Ejemplo: Reunión con Distribuidora Norte, quieren cerrar esta semana",
];

export function LauraComposer({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [placeholder, setPlaceholder] = useState(placeholderExamples[0]);

  useEffect(() => {
    setPlaceholder(placeholderExamples[Math.floor(Math.random() * placeholderExamples.length)]);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed || trimmed.length < MIN_LENGTH || disabled) {
      return;
    }

    await onSubmit(trimmed);
    setValue("");
  }

  const canSend = !disabled && value.trim().length >= MIN_LENGTH;
  const showLengthHint = value.trim().length > 0 && value.trim().length < MIN_LENGTH;

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <textarea
          id="laura-message"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={3}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            resize: "none",
            minHeight: 48,
            maxHeight: 120,
            padding: "12px 14px",
            borderRadius: crmTheme.radius.md,
            border: `1px solid ${crmTheme.laura.border}`,
            background: crmTheme.colors.surface,
            color: crmTheme.laura.textPrimary,
            font: `400 15px/1.5 ${crmTheme.typography.body}`,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = crmTheme.laura.primary;
            e.currentTarget.style.boxShadow = crmTheme.laura.focusRing;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = crmTheme.laura.border;
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          style={{
            appearance: "none",
            border: 0,
            borderRadius: crmTheme.radius.md,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: canSend ? crmTheme.laura.gradient : "#d4d2e8",
            color: "#ffffff",
            cursor: canSend ? "pointer" : "not-allowed",
            transition: "background 0.15s ease",
            flexShrink: 0,
          }}
        >
          <Send size={18} />
        </button>
      </div>
      {showLengthHint && (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: crmTheme.colors.danger }}>
          Escribe al menos {MIN_LENGTH} caracteres
        </p>
      )}
    </form>
  );
}
```

Changes:
- Removed label "Mensaje para Laura"
- Replaced text button with icon-only `Send` button from lucide-react
- Button is 44x44px square with gradient when active
- Textarea has purple focus ring
- Removed explanatory text below input
- Reduced rows from 4 to 3, added maxHeight 120px
- Layout: flex row with textarea + send button

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-composer.tsx
git commit -m "refactor(laura): replace text button with send icon, add focus ring"
```

---

### Task 11: Refactor LauraProposalBlock — gradient header, toggle switch, icons

**Files:**
- Modify: `apps/web/src/components/laura/laura-proposal-block.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file content with:

```tsx
"use client";

import type { ReactNode } from "react";
import { MessageSquare, Target, CalendarClock, ClipboardList, Activity } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import { LauraToggle } from "./laura-toggle";

const blockIcons: Record<string, typeof MessageSquare> = {
  Interacción: MessageSquare,
  Oportunidad: Target,
  Seguimiento: CalendarClock,
  "Tarea interna": ClipboardList,
  "Señales comerciales": Activity,
};

export function LauraProposalBlock({
  title,
  description,
  enabled,
  onToggle,
  toggleLabel,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  toggleLabel: string;
  children: ReactNode;
}) {
  const Icon = blockIcons[title] ?? MessageSquare;

  return (
    <section
      style={{
        display: "grid",
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${enabled ? crmTheme.laura.border : crmTheme.colors.border}`,
        background: crmTheme.colors.surface,
        opacity: enabled ? 1 : 0.5,
        transition: "opacity 0.2s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          background: enabled ? crmTheme.laura.gradient : crmTheme.colors.surfaceMuted,
          transition: "background 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: enabled ? "rgba(255,255,255,0.2)" : crmTheme.colors.border,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={16} color={enabled ? "#ffffff" : crmTheme.colors.textMuted} strokeWidth={2} />
          </div>
          <div style={{ display: "grid", gap: 2 }}>
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: enabled ? "#ffffff" : crmTheme.colors.text,
              }}
            >
              {title}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.4,
                color: enabled ? "rgba(255,255,255,0.8)" : crmTheme.colors.textMuted,
              }}
            >
              {description}
            </p>
          </div>
        </div>

        <LauraToggle checked={enabled} onChange={onToggle} label={toggleLabel} />
      </div>

      <div style={{ display: "grid", gap: 12, padding: "14px 16px" }}>{children}</div>
    </section>
  );
}
```

Changes:
- Replaced native checkbox with `LauraToggle` component
- Added gradient header background when enabled
- Added icon per block type (MessageSquare, Target, CalendarClock, ClipboardList, Activity)
- Icon square with rounded corners (28x28, radius 8)
- Disabled state: gray header, reduced opacity
- Border-radius 14px with overflow hidden for clean header edges

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-proposal-block.tsx
git commit -m "refactor(laura): gradient header, toggle switch, icons per block type"
```

---

### Task 12: Refactor LauraProposalCard — inline card, purple border

**Files:**
- Modify: `apps/web/src/components/laura/laura-proposal-card.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file content with:

```tsx
"use client";

import { Sparkles } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import { StatusBadge } from "@/components/ui/status-badge";
import { LauraProposalBlock } from "./laura-proposal-block";
import { ObjectionsInput } from "./laura-objections-input";
import type { LauraProposalConfirmationResponse, LauraProposalPayload } from "./laura-types";

const opportunityStages = [
  { value: "prospecto", label: "Prospecto" },
  { value: "contacto", label: "Contacto" },
  { value: "visita", label: "Visita" },
  { value: "cotizacion", label: "Cotización" },
  { value: "negociacion", label: "Negociación" },
  { value: "orden_facturacion", label: "Orden de facturación" },
  { value: "venta_cerrada", label: "Venta cerrada" },
  { value: "perdida", label: "Perdida" },
] as const;

const followUpTypes = [
  { value: "llamada", label: "Llamada" },
  { value: "correo", label: "Correo" },
  { value: "reunion", label: "Reunión" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

function toDateTimeLocal(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function textInputStyle() {
  return {
    width: "100%",
    minHeight: 42,
    padding: "10px 12px",
    borderRadius: crmTheme.radius.sm,
    border: `1px solid ${crmTheme.laura.border}`,
    background: crmTheme.laura.soft,
    color: crmTheme.laura.textPrimary,
    font: `400 14px/1.4 ${crmTheme.typography.body}`,
    boxSizing: "border-box" as const,
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };
}

function TextField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={label}
        style={textInputStyle()}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = crmTheme.laura.primary;
          e.currentTarget.style.boxShadow = crmTheme.laura.focusRing;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = crmTheme.laura.border;
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  rows?: number;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={rows}
        aria-label={label}
        style={{
          ...textInputStyle(),
          resize: "vertical",
          minHeight: rows * 24 + 32,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = crmTheme.laura.primary;
          e.currentTarget.style.boxShadow = crmTheme.laura.focusRing;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = crmTheme.laura.border;
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </label>
  );
}

export function LauraProposalCard({
  proposal,
  confirming,
  confirmation,
  onChange,
  onConfirm,
}: {
  proposal: LauraProposalPayload;
  confirming: boolean;
  confirmation: LauraProposalConfirmationResponse | null;
  onChange: (proposal: LauraProposalPayload) => void;
  onConfirm: () => Promise<void>;
}) {
  function updateProposal(mutator: (draft: LauraProposalPayload) => LauraProposalPayload) {
    onChange(mutator(proposal));
  }

  return (
    <div
      style={{
        border: `2px solid ${crmTheme.laura.primary}`,
        borderRadius: 16,
        background: crmTheme.colors.surface,
        boxShadow: "0 4px 16px rgba(99,102,241,0.12)",
        display: "grid",
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 16px",
          background: crmTheme.laura.soft,
          borderBottom: `1px solid ${crmTheme.laura.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={18} color={crmTheme.laura.primary} strokeWidth={2} />
          <span style={{ fontSize: 14, fontWeight: 700, color: crmTheme.laura.textPrimary }}>
            Propuesta de Laura
          </span>
        </div>
        <StatusBadge tone={confirmation ? "success" : "info"}>
          {confirmation ? "Confirmada" : "Borrador"}
        </StatusBadge>
      </div>

      {/* Blocks */}
      <div style={{ display: "grid", gap: 12, padding: 16 }}>
        {proposal.blocks.interaction && (
          <LauraProposalBlock
            title="Interacción"
            description="Resumen base que se convertirá en el registro principal."
            enabled={proposal.blocks.interaction.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  interaction: draft.blocks.interaction
                    ? { ...draft.blocks.interaction, enabled }
                    : draft.blocks.interaction,
                },
              }))
            }
            toggleLabel="Guardar bloque de interacción"
          >
            <TextAreaField
              label="Resumen de la interacción"
              value={proposal.blocks.interaction.summary}
              onChange={(summary) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    interaction: draft.blocks.interaction
                      ? { ...draft.blocks.interaction, summary }
                      : draft.blocks.interaction,
                  },
                }))
              }
              disabled={confirming}
            />
            <TextAreaField
              label="Mensaje original"
              value={proposal.blocks.interaction.rawMessage}
              onChange={(rawMessage) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    interaction: draft.blocks.interaction
                      ? { ...draft.blocks.interaction, rawMessage }
                      : draft.blocks.interaction,
                  },
                }))
              }
              disabled={confirming}
              rows={4}
            />
          </LauraProposalBlock>
        )}

        {proposal.blocks.opportunity && (
          <LauraProposalBlock
            title="Oportunidad"
            description="Define si Laura actualiza una oportunidad existente o crea una nueva."
            enabled={proposal.blocks.opportunity.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  opportunity: draft.blocks.opportunity
                    ? { ...draft.blocks.opportunity, enabled }
                    : draft.blocks.opportunity,
                },
              }))
            }
            toggleLabel="Guardar bloque de oportunidad"
          >
            <TextField
              label="Título de la oportunidad"
              value={proposal.blocks.opportunity.title ?? ""}
              onChange={(title) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    opportunity: draft.blocks.opportunity
                      ? { ...draft.blocks.opportunity, title }
                      : draft.blocks.opportunity,
                  },
                }))
              }
              disabled={confirming}
            />
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
                Etapa
              </span>
              <select
                aria-label="Etapa de la oportunidad"
                value={proposal.blocks.opportunity.stage ?? ""}
                onChange={(event) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      opportunity: draft.blocks.opportunity
                        ? { ...draft.blocks.opportunity, stage: event.target.value }
                        : draft.blocks.opportunity,
                    },
                  }))
                }
                disabled={confirming}
                style={textInputStyle()}
              >
                <option value="">Selecciona una etapa</option>
                {opportunityStages.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </LauraProposalBlock>
        )}

        {proposal.blocks.followUp && (
          <LauraProposalBlock
            title="Seguimiento"
            description="Próximo movimiento comercial con destino operativo directo."
            enabled={proposal.blocks.followUp.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  followUp: draft.blocks.followUp
                    ? { ...draft.blocks.followUp, enabled }
                    : draft.blocks.followUp,
                },
              }))
            }
            toggleLabel="Guardar bloque de seguimiento"
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              <TextField
                label="Título del seguimiento"
                value={proposal.blocks.followUp.title}
                onChange={(title) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      followUp: draft.blocks.followUp
                        ? { ...draft.blocks.followUp, title }
                        : draft.blocks.followUp,
                    },
                  }))
                }
                disabled={confirming}
              />
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
                  Tipo
                </span>
                <select
                  aria-label="Tipo de seguimiento"
                  value={proposal.blocks.followUp.type}
                  onChange={(event) =>
                    updateProposal((draft) => ({
                      ...draft,
                      blocks: {
                        ...draft.blocks,
                        followUp: draft.blocks.followUp
                          ? { ...draft.blocks.followUp, type: event.target.value }
                          : draft.blocks.followUp,
                      },
                    }))
                  }
                  disabled={confirming}
                  style={textInputStyle()}
                >
                  {followUpTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
                Fecha
              </span>
              <input
                type="datetime-local"
                aria-label="Fecha del seguimiento"
                value={toDateTimeLocal(proposal.blocks.followUp.dueAt)}
                onChange={(event) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      followUp: draft.blocks.followUp
                        ? {
                            ...draft.blocks.followUp,
                            dueAt: fromDateTimeLocal(event.target.value),
                          }
                        : draft.blocks.followUp,
                    },
                  }))
                }
                disabled={confirming}
                style={textInputStyle()}
              />
            </label>
          </LauraProposalBlock>
        )}

        {proposal.blocks.task && (
          <LauraProposalBlock
            title="Tarea interna"
            description="Bloque liviano para notas y tareas internas."
            enabled={proposal.blocks.task.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  task: draft.blocks.task
                    ? { ...draft.blocks.task, enabled }
                    : draft.blocks.task,
                },
              }))
            }
            toggleLabel="Guardar bloque de tarea interna"
          >
            <TextField
              label="Título de la tarea"
              value={proposal.blocks.task.title}
              onChange={(title) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    task: draft.blocks.task
                      ? { ...draft.blocks.task, title }
                      : draft.blocks.task,
                  },
                }))
              }
              disabled={confirming}
            />
            <TextAreaField
              label="Notas internas"
              value={proposal.blocks.task.notes ?? ""}
              onChange={(notes) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    task: draft.blocks.task
                      ? { ...draft.blocks.task, notes }
                      : draft.blocks.task,
                  },
                }))
              }
              disabled={confirming}
            />
          </LauraProposalBlock>
        )}

        {proposal.blocks.signals && (
          <LauraProposalBlock
            title="Señales comerciales"
            description="Objeciones, riesgo y nivel de intención detectados."
            enabled={proposal.blocks.signals.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  signals: draft.blocks.signals
                    ? { ...draft.blocks.signals, enabled }
                    : draft.blocks.signals,
                },
              }))
            }
            toggleLabel="Guardar bloque de señales"
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
                Objeciones
              </span>
              <ObjectionsInput
                objections={proposal.blocks.signals.objections}
                disabled={confirming}
                onChange={(objections) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      signals: draft.blocks.signals
                        ? { ...draft.blocks.signals, objections }
                        : draft.blocks.signals,
                    },
                  }))
                }
              />
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              <TextField
                label="Riesgo"
                value={proposal.blocks.signals.risk ?? ""}
                onChange={(risk) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      signals: draft.blocks.signals
                        ? { ...draft.blocks.signals, risk }
                        : draft.blocks.signals,
                    },
                  }))
                }
                disabled={confirming}
              />
              <TextField
                label="Intención de compra"
                value={proposal.blocks.signals.buyingIntent ?? ""}
                onChange={(buyingIntent) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      signals: draft.blocks.signals
                        ? { ...draft.blocks.signals, buyingIntent }
                        : draft.blocks.signals,
                    },
                  }))
                }
                disabled={confirming}
              />
            </div>
          </LauraProposalBlock>
        )}
      </div>

      {/* Confirm Button */}
      <div style={{ padding: "0 16px 16px" }}>
        {confirmation ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: crmTheme.colors.success,
              textAlign: "center",
              padding: "8px 0",
            }}
          >
            Laura guardó {confirmation.saved.length} bloques y descartó {confirmation.discarded.length}.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={confirming}
            style={{
              appearance: "none",
              border: 0,
              borderRadius: crmTheme.radius.md,
              width: "100%",
              minHeight: 44,
              padding: "0 18px",
              background: confirming ? "#d4d2e8" : crmTheme.laura.gradient,
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              cursor: confirming ? "wait" : "pointer",
              transition: "background 0.15s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Sparkles size={16} />
            Confirmar propuesta
          </button>
        )}
      </div>
    </div>
  );
}
```

Changes:
- Removed `SectionCard` wrapper — now a standalone card with purple border
- Added card header with `Sparkles` icon + "Propuesta de Laura" + StatusBadge
- Full-width confirm button with gradient and Sparkles icon
- Input fields use laura theme colors with purple focus rings
- Reduced gap between blocks from 14px to 12px
- Simplified block descriptions

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-proposal-card.tsx
git commit -m "refactor(laura): inline proposal card with purple border and gradient header"
```

---

### Task 13: Refactor LauraAgendaCard — icons, hover, purple palette

**Files:**
- Modify: `apps/web/src/components/laura/laura-agenda-card.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file content with:

```tsx
"use client";

import { MapPin, Phone } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import type { LauraAgendaItem } from "./laura-types";

const priorityLabels: Record<number, { label: string; bg: string; color: string }> = {
  0: { label: "Vencida", bg: "rgba(220,38,38,0.12)", color: "#dc2626" },
  1: { label: "Hoy", bg: "rgba(234,179,8,0.12)", color: "#b45309" },
  2: { label: "Hoy", bg: crmTheme.laura.soft, color: crmTheme.laura.primary },
  3: { label: "Esta semana", bg: crmTheme.colors.surfaceMuted, color: crmTheme.colors.textMuted },
};

const typeConfig: Record<string, { label: string; icon: typeof MapPin }> = {
  visit: { label: "Visita", icon: MapPin },
  follow_up_task: { label: "Seguimiento", icon: Phone },
};

export function LauraAgendaCard({ items }: { items: LauraAgendaItem[] }) {
  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: crmTheme.laura.textMuted }}>
        No hay pendientes activos en tu agenda.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => {
        const priority = priorityLabels[item.priorityGroup ?? 3] ?? priorityLabels[3];
        const type = typeConfig[item.type] ?? { label: item.type, icon: MapPin };
        const Icon = type.icon;

        return (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: crmTheme.radius.md,
              border: `1px solid ${crmTheme.laura.border}`,
              background: crmTheme.colors.surface,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = crmTheme.laura.surface;
              e.currentTarget.style.borderColor = crmTheme.laura.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = crmTheme.colors.surface;
              e.currentTarget.style.borderColor = crmTheme.laura.border;
            }}
          >
            <Icon size={14} color={crmTheme.laura.textMuted} strokeWidth={2} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: crmTheme.radius.pill,
                background: priority.bg,
                color: priority.color,
              }}
            >
              {priority.label}
            </span>
            <span style={{ fontSize: 12, color: crmTheme.laura.textMuted, minWidth: 80 }}>
              {type.label}
            </span>
            <span style={{ fontSize: 14, color: crmTheme.laura.textPrimary }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
```

Changes:
- Added `MapPin` and `Phone` icons from lucide-react
- Updated priority colors to match new palette
- Added hover effect (background + border change)
- Added cursor pointer for interactivity
- Updated text colors to use laura tokens

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-agenda-card.tsx
git commit -m "refactor(laura): add icons, hover states, purple palette to agenda card"
```

---

### Task 14: Refactor LauraChat — single column, inline proposal, header

**Files:**
- Modify: `apps/web/src/components/laura/laura-chat.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file content with:

```tsx
"use client";

const USE_STREAMING = false;

import { useState } from "react";
import { LauraAgendaCard } from "@/components/laura/laura-agenda-card";
import { LauraChatHeader } from "@/components/laura/laura-chat-header";
import { LauraComposer } from "@/components/laura/laura-composer";
import { LauraMessageList } from "@/components/laura/laura-message-list";
import { LauraProposalCard } from "@/components/laura/laura-proposal-card";
import { crmTheme } from "@/components/ui/theme";
import { apiFetchClient } from "@/lib/api.client";
import type {
  LauraAgendaItem,
  LauraAssistantResponse,
  LauraDraftProposal,
  LauraMessageItem,
  LauraMessageStatus,
  LauraProposalConfirmationResponse,
  LauraProposalPayload,
  LauraSessionResponse,
} from "./laura-types";

interface LauraChatInitialContext {
  contextType: "customer" | "opportunity";
  contextEntityId: string;
  contextLabel?: string | null;
}

function createClientMessage(content: string): LauraMessageItem {
  return {
    id: `user-${crypto.randomUUID()}`,
    role: "user",
    kind: "report",
    content,
    createdAt: new Date().toISOString(),
  };
}

function createAssistantMessage(content: string, kind: string): LauraMessageItem {
  return {
    id: `assistant-${crypto.randomUUID()}`,
    role: "assistant",
    kind,
    content,
    createdAt: new Date().toISOString(),
  };
}

function mapSessionMessages(session: LauraSessionResponse): LauraMessageItem[] {
  return session.messages.map((message) => ({
    id: message.id,
    role:
      message.role === "assistant" || message.role === "system" ? message.role : "user",
    kind: message.kind,
    content: message.content,
    createdAt: message.createdAt,
  }));
}

function extractDraftProposal(session: LauraSessionResponse): LauraDraftProposal | null {
  const latestProposal = [...session.proposals].reverse().find((proposal) => proposal.status !== "discarded");
  if (!latestProposal) return null;

  return {
    proposalId: latestProposal.id,
    proposal: latestProposal.payload as LauraProposalPayload,
    status: latestProposal.status,
  };
}

export function LauraChat({
  initialContext,
}: {
  initialContext?: LauraChatInitialContext | null;
}) {
  const [messages, setMessages] = useState<LauraMessageItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draftProposal, setDraftProposal] = useState<LauraDraftProposal | null>(null);
  const [agendaItems, setAgendaItems] = useState<LauraAgendaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<LauraProposalConfirmationResponse | null>(null);
  const [clarificationOptions, setClarificationOptions] = useState<{
    type: "customer" | "opportunity" | "date" | "action";
    options?: Array<{ id: string; label: string }>;
  } | null>(null);

  async function loadSession(nextSessionId: string) {
    const response = await apiFetchClient(
      `/laura/sessions/${nextSessionId}?includeMessages=true&includeProposals=true`,
    );

    if (!response.ok) {
      return;
    }

    const session = (await response.json()) as LauraSessionResponse;
    setMessages(mapSessionMessages(session));
    setDraftProposal((current) => extractDraftProposal(session) ?? current);
  }

  async function handleSend(content: string) {
    const clientMessage = createClientMessage(content);
    (clientMessage as typeof clientMessage & { status: LauraMessageStatus }).status = "pending";

    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirmation(null);
    setClarificationOptions(null);
    setMessages((current) => [...current, clientMessage]);

    try {
      const response = await apiFetchClient("/laura/messages", {
        method: "POST",
        body: JSON.stringify({
          sessionId: sessionId ?? undefined,
          content,
          contextType: sessionId ? undefined : initialContext?.contextType,
          contextEntityId: sessionId ? undefined : initialContext?.contextEntityId,
        }),
      });

      if (!response.ok) {
        throw new Error("Laura no pudo procesar el mensaje.");
      }

      const body = (await response.json()) as LauraAssistantResponse;
      setSessionId(body.sessionId);
      setMessages((current) =>
        current.map((message) =>
          message.id === clientMessage.id
            ? { ...message, status: "confirmed" as LauraMessageStatus }
            : message,
        ),
      );
      setMessages((current) => [
        ...current,
        createAssistantMessage(body.message, body.mode),
      ]);

      if (body.mode === "proposal") {
        setDraftProposal({
          proposalId: body.proposalId,
          proposal: body.proposal,
          status: "draft",
        });
      } else {
        setDraftProposal(null);
      }

      if (body.mode === "agenda") {
        setAgendaItems(body.agenda.items);
      }

      if (body.mode === "clarification") {
        setClarificationOptions(body.clarification);
      } else {
        setClarificationOptions(null);
      }

      await loadSession(body.sessionId);
    } catch (caughtError) {
      setMessages((current) =>
        current.map((message) =>
          message.id === clientMessage.id
            ? { ...message, status: "error" as LauraMessageStatus }
            : message,
        ),
      );
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Laura no pudo procesar el mensaje.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!draftProposal) return;

    setConfirming(true);
    setError(null);
    setNotice(null);

    try {
      const response = await apiFetchClient(
        `/laura/proposals/${draftProposal.proposalId}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            proposal: draftProposal.proposal,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Laura no pudo confirmar la propuesta.");
      }

      const body = (await response.json()) as LauraProposalConfirmationResponse;
      setConfirmation(body);
      setDraftProposal({
        proposalId: body.proposalId,
        proposal: body.proposal,
        status: body.status,
      });

      if (sessionId) {
        await loadSession(sessionId);
      }

      setNotice(
        `Laura guardó ${body.saved.length} bloques y descartó ${body.discarded.length}.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Laura no pudo confirmar la propuesta.",
      );
    } finally {
      setConfirming(false);
    }
  }

  function handleRetry(content: string) {
    setMessages((current) => current.filter((m) => m.status !== "error"));
    void handleSend(content);
  }

  return (
    <div style={{ display: "grid", gap: 0 }}>
      <LauraChatHeader hasActiveSession={!!sessionId} />

      {/* Context Banner */}
      {initialContext && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: crmTheme.radius.md,
            background: crmTheme.laura.soft,
            border: `1px solid ${crmTheme.laura.border}`,
            color: crmTheme.laura.primary,
            fontSize: 13,
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          Contexto: <strong>{initialContext.contextLabel ?? initialContext.contextEntityId}</strong>
        </div>
      )}

      {/* Notice Banner */}
      {notice && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: crmTheme.radius.md,
            background: "rgba(34,197,94,0.08)",
            borderLeft: `3px solid #22c55e`,
            color: crmTheme.colors.success,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {notice}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: crmTheme.radius.md,
            background: "rgba(220,38,38,0.08)",
            borderLeft: `3px solid #dc2626`,
            color: crmTheme.colors.danger,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Message List */}
      <LauraMessageList
        messages={messages}
        busy={busy}
        onRetry={handleRetry}
        onSend={handleSend}
      />

      {/* Clarification Options */}
      {clarificationOptions && clarificationOptions.options && clarificationOptions.options.length > 0 && (
        <div style={{ display: "grid", gap: 8, padding: "8px 0" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
            Selecciona una opción:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {clarificationOptions.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={busy}
                onClick={() => handleSend(option.label)}
                style={{
                  appearance: "none",
                  border: `1px solid ${crmTheme.laura.border}`,
                  borderRadius: crmTheme.radius.md,
                  padding: "8px 16px",
                  background: crmTheme.laura.soft,
                  color: crmTheme.laura.primary,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!busy) {
                    e.currentTarget.style.background = crmTheme.colors.surface;
                    e.currentTarget.style.borderColor = crmTheme.laura.primary;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = crmTheme.laura.soft;
                  e.currentTarget.style.borderColor = crmTheme.laura.border;
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Agenda */}
      {agendaItems.length > 0 && (
        <div style={{ padding: "8px 0" }}>
          <LauraAgendaCard items={agendaItems} />
        </div>
      )}

      {/* Inline Proposal Card */}
      {draftProposal && (
        <div style={{ padding: "12px 0" }}>
          <LauraProposalCard
            proposal={draftProposal.proposal}
            confirming={confirming}
            confirmation={confirmation}
            onChange={(proposal) =>
              setDraftProposal((current) =>
                current ? { ...current, proposal } : current
              )
            }
            onConfirm={handleConfirm}
          />
        </div>
      )}

      {/* Sticky Composer */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          paddingTop: 16,
          paddingBottom: 8,
          background: "linear-gradient(180deg, rgba(248,246,255,0) 0%, rgba(248,246,255,0.94) 18%, rgba(248,246,255,1) 100%)",
        }}
      >
        <LauraComposer disabled={busy || confirming} onSubmit={handleSend} />
      </div>
    </div>
  );
}
```

Changes:
- Removed two-column grid layout entirely
- Removed `SectionCard` wrappers
- Added `LauraChatHeader` at top
- Proposal card is now inline (not in a separate column)
- Updated all color references to use `laura` tokens
- Updated gradient fade to use `laura.surface` color
- Updated clarification option buttons to use laura colors
- Updated banners with left-border style
- Message list receives `onSend` for empty state

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-chat.tsx
git commit -m "refactor(laura): single-column layout with inline proposal and chat header"
```

---

### Task 15: Update LauraContextLauncher to match new style

**Files:**
- Modify: `apps/web/src/components/laura/laura-context-launcher.tsx`

- [ ] **Step 1: Update the component**

Replace the entire file content with:

```tsx
"use client";

import { MessageSquare } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionCard } from "@/components/ui/section-card";
import { crmTheme } from "@/components/ui/theme";

interface LauraContextLauncherProps {
  contextType: "customer" | "opportunity";
  contextEntityId: string;
  contextLabel: string;
}

export function LauraContextLauncher({
  contextType,
  contextEntityId,
  contextLabel,
}: LauraContextLauncherProps) {
  const searchParams = new URLSearchParams({
    contextType,
    contextEntityId,
    contextLabel,
  });

  return (
    <SectionCard
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: crmTheme.laura.gradient,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MessageSquare size={14} color="#ffffff" strokeWidth={2.5} />
          </div>
          Laura
        </span>
      }
      description={`Reportá una visita o seguimiento con contexto de ${contextLabel} usando lenguaje natural.`}
      actions={
        <ButtonLink href={`/laura?${searchParams.toString()}`} variant="ghost" size="sm">
          Hablar con Laura
        </ButtonLink>
      }
      padding="18px"
    >
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.6,
          color: crmTheme.laura.textMuted,
        }}
      >
        Laura interpreta tu mensaje y genera bloques editables para confirmar directamente en el CRM.
      </p>
    </SectionCard>
  );
}
```

Changes:
- Added `MessageSquare` icon with laura gradient in the title
- Updated description text to be more concise
- Updated text color to use laura tokens

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-context-launcher.tsx
git commit -m "refactor(laura): update context launcher with laura icon and styling"
```

---

### Task 16: Update ObjectionsInput to match new style

**Files:**
- Modify: `apps/web/src/components/laura/laura-objections-input.tsx`

- [ ] **Step 1: Update the component**

Replace the entire file content with:

```tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

export function ObjectionsInput({
  objections,
  disabled,
  onChange,
}: {
  objections: string[];
  disabled?: boolean;
  onChange: (objections: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed && !objections.includes(trimmed)) {
        onChange([...objections, trimmed]);
        setInputValue("");
      }
    }

    if (event.key === "Backspace" && inputValue === "" && objections.length > 0) {
      onChange(objections.slice(0, -1));
    }
  }

  function handleRemove(index: number) {
    onChange(objections.filter((_, i) => i !== index));
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        minHeight: 42,
        padding: "6px 10px",
        borderRadius: crmTheme.radius.sm,
        border: `1px solid ${crmTheme.laura.border}`,
        background: crmTheme.laura.soft,
      }}
    >
      {objections.map((objection, index) => (
        <span
          key={`${objection}-${index}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px 2px 10px",
            borderRadius: crmTheme.radius.pill,
            background: crmTheme.laura.primary,
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {objection}
          {!disabled && (
            <button
              type="button"
              onClick={() => handleRemove(index)}
              style={{
                appearance: "none",
                border: 0,
                background: "none",
                color: "rgba(255,255,255,0.7)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: 0,
                marginLeft: 2,
              }}
              aria-label={`Eliminar objeción: ${objection}`}
            >
              <X size={14} />
            </button>
          )}
        </span>
      ))}
      <input
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={objections.length === 0 ? "Escribe y presiona Enter" : ""}
        aria-label="Agregar objeción"
        style={{
          flex: 1,
          minWidth: 80,
          border: 0,
          outline: 0,
          background: "transparent",
          font: `400 14px/1.4 ${crmTheme.typography.body}`,
          color: crmTheme.laura.textPrimary,
        }}
      />
    </div>
  );
}
```

Changes:
- Replaced text `×` with `X` icon from lucide-react
- Updated objection tags to use purple background with white text (pill style)
- Updated border and background to use laura tokens
- Fixed key prop to include index for duplicate objections

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-objections-input.tsx
git commit -m "refactor(laura): update objections input with X icon and purple pill tags"
```

---

### Task 17: Final verification and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Verify TypeScript compiles**

Run:
```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -50
```

Expected: No errors, or only pre-existing errors unrelated to Laura files.

- [ ] **Step 2: Verify dev server starts**

Run:
```bash
cd apps/web && timeout 15 npm run dev 2>&1 | head -20 || true
```

Expected: Next.js starts without compilation errors.

- [ ] **Step 3: Check for unused imports**

Run:
```bash
grep -r "SectionCard" apps/web/src/components/laura/ || echo "No SectionCard references in laura components"
```

Expected: Only `laura-context-launcher.tsx` should reference SectionCard (intentionally).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(laura): final cleanup and verification for UI redesign"
```

---

## File Summary

| Action | File |
|--------|------|
| **Create** | `apps/web/src/components/laura/laura-toggle.tsx` |
| **Create** | `apps/web/src/components/laura/laura-typing-indicator.tsx` |
| **Create** | `apps/web/src/components/laura/laura-empty-state.tsx` |
| **Create** | `apps/web/src/components/laura/laura-chat-header.tsx` |
| **Modify** | `apps/web/package.json` |
| **Modify** | `apps/web/src/components/ui/theme.ts` |
| **Modify** | `apps/web/src/app/(app)/laura/page.tsx` |
| **Modify** | `apps/web/src/components/laura/laura-chat.tsx` |
| **Modify** | `apps/web/src/components/laura/laura-entry-card.tsx` |
| **Modify** | `apps/web/src/components/laura/laura-message-list.tsx` |
| **Modify** | `apps/web/src/components/laura/laura-proposal-card.tsx` |
| **Modify** | `apps/web/src/components/laura/laura-proposal-block.tsx` |
| **Modify** | `apps/web/src/components/laura/laura-composer.tsx` |
| **Modify** | `apps/web/src/components/laura/laura-agenda-card.tsx` |
| **Modify** | `apps/web/src/components/laura/laura-context-launcher.tsx` |
| **Modify** | `apps/web/src/components/laura/laura-objections-input.tsx` |

## Spec Coverage Check

| Spec Requirement | Task |
|------------------|------|
| Single-column centered layout (max-width 680px) | Task 7, 14 |
| Laura brand identity (purple/violet) | Task 1, all modifications |
| Proposal cards inline in chat | Task 14 |
| Header with avatar + session badge | Task 5, 14 |
| Welcome empty state + clickable examples | Task 4, 9 |
| Typing indicator with bounce animation | Task 3, 9 |
| Custom toggle switches | Task 2, 11 |
| Gradient headers on proposal blocks | Task 11 |
| Icons per block type | Task 11 |
| Send icon in composer | Task 10 |
| Focus rings on inputs | Task 10, 12 |
| Agenda card with icons + hover | Task 13 |
| CSS animations (bounce, pulse) | Task 6 |
| Accessibility (focus states, aria labels, role=switch) | Task 2, 10, 12 |
| Lucide React icons | Task 1, all component tasks |
| Remove two-column grid | Task 14 |
| Remove SectionCard from proposal | Task 12, 14 |
| Remove native checkboxes | Task 11 |
| Remove text-based typing indicator | Task 9 |
| Remove InlineMetrics from header | Task 7 |

No placeholders found. All code is complete with actual implementations.
