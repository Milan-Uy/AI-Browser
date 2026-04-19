import { useEffect, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { PageContextBadge } from "./PageContextBadge";
import { useChat } from "../hooks/useChat";
import { usePageContent } from "../hooks/usePageContent";

export function ChatPanel() {
  const { messages, pending, send } = useChat();
  const { content, loading, refresh } = usePageContent();
  const [includePage, setIncludePage] = useState(true);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput("");
    await send(text, includePage ? content : null);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="px-3 py-2 border-b border-slate-200 text-sm font-semibold text-slate-700">
        AI Browser Agent
      </header>
      <PageContextBadge
        content={content}
        loading={loading}
        included={includePage}
        onToggle={setIncludePage}
        onRefresh={refresh}
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="text-slate-400 text-sm text-center mt-8">
            Ask about this page or anything else.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>
      <form onSubmit={onSubmit} className="border-t border-slate-200 p-2 flex gap-2">
        <input
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
        />
        <button
          type="submit"
          className="rounded-md bg-indigo-600 text-white text-sm px-3 py-2 disabled:opacity-50"
          disabled={pending || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
