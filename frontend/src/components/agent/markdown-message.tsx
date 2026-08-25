"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/** Tailwind-styled element overrides — no typography plugin, just enough
 *  spacing/weight to make a Claude/ChatGPT-style reply (paragraphs, lists,
 *  bold, code, links) read cleanly instead of one dense wall of text. */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-3">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="mt-4 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h3 className="mt-3 text-sm font-semibold">{children}</h3>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    // A fenced block's <code> carries a language- className from remark; a
    // bare inline `code` span doesn't — that's the only reliable signal to
    // tell them apart here.
    const isBlock = Boolean(className);
    if (isBlock) return <code className="block font-mono text-[0.85em]">{children}</code>;
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-sm">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  tr: ({ children }) => <tr className="border-b last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 font-semibold whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
};

/** Renders one chat message's markdown (bold, lists, links, code, etc.) with
 *  plain-text styling appropriate for a compact chat bubble/column. */
export function MarkdownMessage({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("text-sm [&>*:first-child]:mt-0", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
