"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

/**
 * Renders markdown safely (no raw HTML). Wikilinks are pre-rewritten to
 * internal /nodes/:id links upstream, so an internal href renders as a
 * client-navigable Link.
 */
export function NodeMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            const h = href ?? "#";
            if (h.startsWith("/")) {
              return (
                <Link href={h} className="font-medium text-[var(--type-fact)] hover:underline">
                  {children}
                </Link>
              );
            }
            return (
              <a href={h} target="_blank" rel="noreferrer" className="text-[var(--type-fact)] hover:underline">
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
