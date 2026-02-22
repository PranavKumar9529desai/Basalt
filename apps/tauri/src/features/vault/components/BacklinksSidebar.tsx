import type { FC } from "react";
import type { LinkSuggestion } from "../types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BacklinksSidebarProps {
  backlinks: string[];
  onOpenNote: (note: LinkSuggestion) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pathToLinkSuggestion(path: string): LinkSuggestion {
  const name = path.split("/").pop() ?? path;
  return { name, path };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BacklinksSidebar: FC<BacklinksSidebarProps> = ({
  backlinks,
  onOpenNote,
}) => {
  return (
    <div className="flex flex-col h-full bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800 shrink-0">
        {/* Link icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="text-slate-400 shrink-0"
        >
          <path
            d="M6.5 9.5a3.536 3.536 0 0 0 5 0l2-2a3.536 3.536 0 0 0-5-5L7.5 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M9.5 6.5a3.536 3.536 0 0 0-5 0l-2 2a3.536 3.536 0 0 0 5 5l1-1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
          Backlinks
        </span>
        {backlinks.length > 0 && (
          <span className="ml-auto text-xs text-slate-500 tabular-nums">
            {backlinks.length}
          </span>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto py-1">
        {backlinks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-slate-700"
            >
              <path
                d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-xs text-slate-500 text-center">
              No notes link here yet.
            </p>
          </div>
        ) : (
          backlinks.map((path) => {
            const note = pathToLinkSuggestion(path);
            return (
              <button
                key={path}
                type="button"
                onClick={() => onOpenNote(note)}
                title={path}
                className="
                  w-full text-left
                  flex items-center gap-2
                  px-3 py-1.5
                  text-sm text-slate-300
                  hover:bg-slate-800 hover:text-slate-100
                  transition-colors truncate
                "
              >
                {/* File icon */}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0 text-slate-500"
                >
                  <path
                    d="M9.5 1.5H3.5A1 1 0 0 0 2.5 2.5V13.5A1 1 0 0 0 3.5 14.5H12.5A1 1 0 0 0 13.5 13.5V5.5L9.5 1.5Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                  />
                  <path
                    d="M9.5 1.5V5.5H13.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="truncate">{note.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
