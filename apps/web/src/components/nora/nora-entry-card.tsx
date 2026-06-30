"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { NoraMessageItem } from "./nora-types";
import { NoraMarkdownContent } from "./nora-markdown-content";

export function NoraEntryCard({ message }: { message: NoraMessageItem }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="self-end max-w-[70%] rounded-[12px_12px_2px_12px] bg-[#eef1f6] p-3 text-[13.5px] leading-relaxed text-[#0c2c44]"
      >
        <p className="m-0 whitespace-pre-wrap">{message.content}</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex max-w-[88%] gap-3"
    >
      <div
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: "linear-gradient(135deg,#6d4ff0,#9b5cf0)" }}
      >
        <Sparkles className="h-[15px] w-[15px] text-white" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5 text-[13.5px] leading-relaxed text-[#2a2540]">
        <NoraMarkdownContent content={message.content} />
      </div>
    </motion.div>
  );
}
