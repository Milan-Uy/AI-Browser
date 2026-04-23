interface Props {
  prompt: string;
  onDecision: (approved: boolean) => void;
}

export function RunConfirmDialog({ prompt, onDecision }: Props) {
  return (
    <div className="border-2 border-indigo-400 bg-indigo-50 rounded-md p-3 my-2 text-sm">
      <div className="font-semibold text-indigo-900 mb-1">Run this task?</div>
      <div className="text-indigo-800 mb-2 break-words">{prompt}</div>
      <div className="flex gap-2 justify-end">
        <button
          className="px-3 py-1 rounded bg-white border border-indigo-300 text-indigo-900 hover:bg-indigo-100"
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
