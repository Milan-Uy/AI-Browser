interface Props {
  prompt: string;
  onDecision: (approved: boolean) => void;
}

export function RunConfirmDialog({ prompt, onDecision }: Props) {
  return (
    <div className="border-2 border-indigo-500 bg-indigo-950 rounded-md p-3 my-2 text-sm">
      <div className="font-semibold text-indigo-100 mb-1">Run this task?</div>
      <div className="text-indigo-300 mb-2 break-words">{prompt}</div>
      <div className="flex gap-2 justify-end">
        <button
          className="px-3 py-1 rounded bg-slate-700 border border-indigo-600 text-indigo-300 hover:bg-slate-600"
          onClick={() => onDecision(false)}
        >
          Cancel
        </button>
        <button
          className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={() => onDecision(true)}
        >
          Run
        </button>
      </div>
    </div>
  );
}
