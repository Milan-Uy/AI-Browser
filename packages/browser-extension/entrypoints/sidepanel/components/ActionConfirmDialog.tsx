import type { Step } from "@/lib/messaging";

interface Props {
  step: Step;
  onDecision: (approved: boolean) => void;
}

export function ActionConfirmDialog({ step, onDecision }: Props) {
  return (
    <div className="border-2 border-amber-400 bg-amber-50 rounded-md p-3 my-2 text-sm">
      <div className="font-semibold text-amber-900 mb-1">
        Confirm step {step.stepNumber}
      </div>
      <div className="text-amber-900 mb-2">
        <span className="font-mono bg-white/60 px-1 rounded">{step.action}</span>{" "}
        {describe(step)}
      </div>
      {step.explanation && (
        <div className="text-xs text-amber-800 mb-2 italic">{step.explanation}</div>
      )}
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

function describe(step: Step): string {
  const target = step.id ? `[${step.id}]${step.name ? ` ${step.name}` : ""}` : "";
  switch (step.action) {
    case "click":
    case "hover":
      return `on ${target}`;
    case "type":
      return `${target} with "${(step.value ?? "").slice(0, 40)}"`;
    case "scroll":
      return target ? `into ${target}` : (step.value ?? "down");
    case "navigate":
      return `to ${step.value ?? ""}`;
    case "switchTab":
      return `tab ${step.id}`;
    default:
      return step.action;
  }
}
