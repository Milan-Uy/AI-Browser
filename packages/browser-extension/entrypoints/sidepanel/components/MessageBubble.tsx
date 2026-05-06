export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  pending?: boolean;
}

function SparkleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0 mt-1"
    >
      <defs>
        <linearGradient id="msgSg" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path
        d="M50,5 C52,30 70,48 95,50 C70,52 52,70 50,95 C48,70 30,52 5,50 C30,48 48,30 50,5 Z"
        fill="url(#msgSg)"
      />
    </svg>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const base = "rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words";

  if (isSystem) {
    return (
      <div className={`${base} bg-amber-50 text-amber-800 border border-amber-200 self-center max-w-full`}>
        {message.content}
      </div>
    );
  }

  if (isUser) {
    return (
      <div className={`${base} bg-blue-400 text-white self-end max-w-[85%]`}>
        {message.content}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5 self-start max-w-[85%]">
      <SparkleIcon />
      <p className={`${base} text-gray-800`}>
        {message.content}
        {message.pending && <span className="ml-1 animate-pulse">▌</span>}
      </p>
    </div>
  );
}
