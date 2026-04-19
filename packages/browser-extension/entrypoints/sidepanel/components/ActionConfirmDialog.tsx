import type { LLMAction } from "@/lib/messaging";

interface Props {
  action: LLMAction;
  onDecision: (approved: boolean) => void;
}

export function ActionConfirmDialog({ action, onDecision }: Props) {
  return (
    <div className="border-2 border-amber-400 bg-amber-50 rounded-md p-3 my-2 text-sm">
      <div className="font-semibold text-amber-900 mb-1">Confirm action</div>
      <div className="text-amber-900 mb-2">
        <span className="font-mono bg-white/60 px-1 rounded">{action.kind}</span>{" "}
        {describe(action)}
      </div>
      <div className="flex gap-2 justify-end">
        <button
          className="px-3 py-1 rounded bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
          onClick={() => onDecision(false)}
        >
          Deny
        </button>
        <button
          className="px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700"
          onClick={() => onDecision(true)}
        >
          Allow
        </button>
      </div>
    </div>
  );
}

function describe(a: LLMAction): string {
  switch (a.kind) {
    case "click":    return `on ${a.selector}`;
    case "fill":     return `${a.selector} with "${a.value.slice(0, 40)}"`;
    case "select":   return `${a.selector} = "${a.value}"`;
    case "scroll":   return a.selector ? `into ${a.selector}` : `${a.direction ?? "down"}`;
    case "navigate": return `to ${a.url}`;
  }
}
