import Link from "next/link";
import { listConversations, getMessages } from "@/lib/data/ask";
import { AskChat } from "@/components/ask/AskChat";

export const dynamic = "force-dynamic";

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const [conversations, messages] = await Promise.all([
    listConversations(),
    c ? getMessages(c) : Promise.resolve([]),
  ]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="p-3">
          <Link
            href="/ask"
            className="block rounded-md border border-border px-3 py-1.5 text-center text-sm font-medium hover:bg-panel"
          >
            + New chat
          </Link>
        </div>
        <nav className="flex-1 overflow-auto px-2 pb-3">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/ask?c=${conv.id}`}
              className={`block truncate rounded-md px-2 py-1.5 text-sm hover:bg-panel ${
                conv.id === c ? "bg-panel font-medium" : "text-muted"
              }`}
            >
              {conv.title}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* key forces a fresh chat state when switching conversations */}
        <AskChat key={c ?? "new"} initialMessages={messages} conversationId={c} />
      </div>
    </div>
  );
}
