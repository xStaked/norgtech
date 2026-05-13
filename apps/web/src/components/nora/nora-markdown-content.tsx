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
