import type { PageContent } from "@/lib/messaging";

interface Props {
  content: PageContent | null;
  loading: boolean;
  included: boolean;
  onToggle: (next: boolean) => void;
  onRefresh: () => void;
}

export function PageContextBadge({ content, loading, included, onToggle, onRefresh }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-700 bg-slate-800 text-xs">
      <label className="flex items-center gap-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => onToggle(e.target.checked)}
        />
        Include page
      </label>
      <div className="flex-1 truncate text-slate-300" title={content?.url ?? ""}>
        {loading ? "Reading page…" : content ? content.title || content.url : "No page"}
      </div>
      {content && (
        <span className="text-slate-400" title="interactive elements">
          {content.elements.length} ⟋ {content.text.length}c
        </span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        className="text-indigo-400 hover:underline"
        disabled={loading}
      >
        Refresh
      </button>
    </div>
  );
}
