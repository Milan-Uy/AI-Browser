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
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-700">
      <label className="flex items-center gap-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => onToggle(e.target.checked)}
        />
        Include page
      </label>
      <div className="flex-1 truncate text-gray-500" title={content?.url ?? ""}>
        {loading ? "Reading page…" : content ? content.title || content.url : "No page"}
      </div>
      {content && (
        <span className="text-gray-400" title="interactive elements">
          {content.elements.length} ⟋ {content.text.length}c
        </span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        className="text-blue-500 hover:text-blue-700 disabled:opacity-40"
        disabled={loading}
      >
        Refresh
      </button>
    </div>
  );
}
