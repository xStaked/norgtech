"use client";

import { motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { NoraMessageItem } from "./nora-types";
import { NoraMarkdownContent } from "./nora-markdown-content";

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const roleCopy: Record<NoraMessageItem["role"], string> = {
  user: "Tú",
  assistant: "Nora",
  system: "Sistema",
};

export function NoraEntryCard({ message }: { message: NoraMessageItem }) {
  const isUser = message.role === "user";

  return (
    <motion.article
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={isUser ? "flex justify-end" : "flex justify-start"}
    >
      <div
        className={`max-w-[85%] space-y-1.5 rounded-2xl px-4 py-3 ${
          isUser
            ? "rounded-br-md bg-gradient-to-br from-nora-500 to-nora-600 text-white shadow-md shadow-nora-500/20"
            : "w-full max-w-[680px] rounded-bl-md border border-border/40 bg-card/80 shadow-sm backdrop-blur-sm"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!isUser && (
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-nora-500 to-nora-600">
                <MessageSquare className="h-3 w-3 text-white" strokeWidth={2.5} />
              </div>
            )}
            <span className="text-xs font-bold">{roleCopy[message.role]}</span>
          </div>
          <span className={`text-[11px] ${isUser ? "text-white/60" : "text-muted-foreground"}`}>
            {formatMessageTime(message.createdAt)}
          </span>
        </div>
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="text-[15px] leading-relaxed">
            <NoraMarkdownContent content={message.content} />
          </div>
        )}
      </div>
    </motion.article>
  );
}
