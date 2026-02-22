import { EditorView, WidgetType } from "@codemirror/view";

/**
 * Shared context passed to all decoration handlers during the single tree walk.
 * Created once per decoration build cycle and shared across all handlers.
 */
export interface DecorationContext {
    /** The currently focused line (null if editor not focused) */
    activeLine: { from: number; to: number; number: number } | null;
    /** Cursor head position */
    headPos: number;
    /** The editor view */
    view: EditorView;
    /** Accumulated code block ranges (populated by code-blocks handler during the walk) */
    codeBlockRanges: { from: number; to: number }[];
}

/** Collected decoration ranges from all handlers, sorted later via Decoration.set(..., true) */
export interface DecorationCollector {
    addLineClass(pos: number, className: string): void;
    addMark(from: number, to: number, className: string): void;
    addReplace(from: number, to: number, widget: WidgetType, block?: boolean): void;
}

/** Check if a position falls inside any known code block range */
export function isInCodeBlock(pos: number, ranges: { from: number; to: number }[]): boolean {
    for (const r of ranges) {
        if (pos >= r.from && pos <= r.to) return true;
    }
    return false;
}
