import type { PageState } from "@/lib/messaging";

interface Props {
  state: PageState | null;
  loading: boolean;
  included: boolean;
  onToggle: (next: boolean) => void;
  onRefresh: () => void;
}

export function PageContextBadge({ state, loading, included, onToggle, onRefresh }: Props) {
  const totalElements = state
    ? Object.values(state.interactiveElements).reduce((n, arr) => n + arr.length, 0)
    : 0;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 text-xs">
      <label className="flex items-center gap-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => onToggle(e.target.checked)}
        />
        Include page
      </label>
      <div className="flex-1 truncate text-slate-600" title={state?.tab.url ?? ""}>
        {loading ? "Reading page…" : state ? state.tab.title || state.tab.url || "(no title)" : "No page"}
      </div>
      {state && (
        <span className="text-slate-500" title="interactive elements">
          {totalElements} els
        </span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        className="text-indigo-600 hover:underline"
        disabled={loading}
      >
        Refresh
      </button>
    </div>
  );
}
