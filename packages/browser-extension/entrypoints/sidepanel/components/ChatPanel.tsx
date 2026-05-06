import { useEffect, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { PageContextBadge } from "./PageContextBadge";
import { useChat } from "../hooks/useChat";
import { usePageContent } from "../hooks/usePageContent";

function SparkleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sg" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path
        d="M50,5 C52,30 70,48 95,50 C70,52 52,70 50,95 C48,70 30,52 5,50 C30,48 48,30 50,5 Z"
        fill="url(#sg)"
      />
    </svg>
  );
}

function SendIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={active ? "text-black" : "text-slate-400"}
    >
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  );
}

export function ChatPanel() {
  const { messages, pending, send, cancel, clear } = useChat();
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
    await send(text, includePage);
  };

  const hasError = messages[messages.length - 1]?.content.includes("[error]");
  const errorText = hasError
    ? (messages[messages.length - 1].content.match(/\[error\] (.+)/) ?? [])[1] ?? ""
    : "";
  const isConnectionError =
    errorText === "" ||
    errorText.toLowerCase().includes("fetch") ||
    errorText.toLowerCase().includes("failed") ||
    errorText.toLowerCase().includes("network");

  return (
    <div
      className="h-full flex flex-col"
      style={{ background: "radial-gradient(ellipse 90% 55% at 0% 100%, #3b82f6 0%, #93c5fd 30%, #ffffff 60%)" }}
    >
      <header className="px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">AI Browser</span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        )}
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
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="flex items-center gap-2">
              <SparkleIcon />
              <span className="text-xl font-semibold text-gray-800">AI Browser</span>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>
      {hasError && (
        <div className="mx-3 mb-2 px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg border border-red-200">
          {errorText || "Something went wrong."}
          {isConnectionError && " Make sure the FastAPI server is running on :8000."}
        </div>
      )}
      <form onSubmit={onSubmit} className="px-3 pb-3 pt-1">
        <div
          className="p-[2px] rounded-2xl"
          style={{ background: "linear-gradient(135deg, #3b82f6, #22c55e)" }}
        >
          <div className="flex items-center gap-2 bg-white rounded-2xl px-3 py-2">
            <input
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={pending}
            />
            {pending ? (
              <button
                type="button"
                onClick={cancel}
                className="text-xs text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded-lg border border-gray-200"
              >
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="disabled:cursor-not-allowed"
              >
                <SendIcon active={!!input.trim()} />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
