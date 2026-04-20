export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  pending?: boolean;
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const base = "rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words";
  const style = isSystem
    ? `${base} bg-amber-50 text-amber-900 border border-amber-200 self-center max-w-full`
    : isUser
      ? `${base} bg-indigo-600 text-white self-end max-w-[85%]`
      : `${base} bg-slate-100 text-slate-900 self-start max-w-[85%]`;

  return (
    <div className={style}>
      {message.content}
      {message.pending && <span className="ml-1 animate-pulse">▌</span>}
    </div>
  );
}
