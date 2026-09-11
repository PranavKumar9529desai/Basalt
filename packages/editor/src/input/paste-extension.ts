import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type {
  AmbiguousPasteRequest,
  AmbiguousPasteResolver,
  OnPasteFileFn,
  OnPasteHtmlFn,
  OnPasteImageFn,
  PasteRichChoice,
  UrlLinkFormatterFn,
} from "../types";

export type { AmbiguousPasteRequest, AmbiguousPasteResolver, PasteRichChoice };

/**
 * Callbacks for the rich-paste pipeline. All stays in `packages/editor`
 * as pure injections — the feature layer owns IPC (ADR-022 rule 2).
 */
export interface PasteCallbacks {
  /** Save pasted image bytes into the vault; returns `![[rel]]` target. */
  onPasteImage?: OnPasteImageFn;
  /** Convert pasted HTML to Markdown insert text. Never policy-gated: the
   *  extension applies the active paste mode (`getPasteMode`) at insert
   *  time so the Paste-As picker can offer BOTH flavors afterwards. */
  onPasteHtml?: OnPasteHtmlFn;
  /** Save an external file (uri-list) into the vault; returns insert text. */
  onPasteFile?: OnPasteFileFn;
  /** Smart-paste: wrap a pasted URL around the current selection. */
  urlLinkFormatter?: UrlLinkFormatterFn;
  /** Active Files & Links paste mode — the default when rich/plain differ. */
  getPasteMode?: () => "smart" | "keep-formatting" | "plain-text";
  /** Inline Paste-As chooser (VS Code PostEditWidget) for ambiguous pastes.
   *  The default applies first; the host surfaces the alternatives near the
   *  paste point and `resolve` swaps the just-inserted text if the user
   *  picks a different flavor (`null` keeps the default). */
  onAmbiguousPaste?: (
    request: AmbiguousPasteRequest,
    resolve: AmbiguousPasteResolver,
  ) => void;
}

/** The one paste whose text is still pending a Paste-As swap. */
interface PendingPasteAs {
  view: EditorView;
  from: number;
  to: number;
  inserted: string;
  alternative: string;
  defaultId: PasteRichChoice;
}

let pendingPasteAs: PendingPasteAs | null = null;

/**
 * Paste pipeline — dispatch by MIME type:
 *
 *   1. `image/*` items   → save to vault (onPasteImage) → insert `![[rel]]`
 *   2. `file://` uri-list → save external file to vault (onPasteFile)
 *   3. `text/html`        → convert to Markdown (onPasteHtml)
 *   4. `text/plain` URL + non-empty selection → smart link wrap
 *   5. default            → plain-text insert (CM built-in)
 *
 * Every insert is a single `view.dispatch` = one undo step (file save +
 * text insert undo together). Returns an empty extension when no callback
 * is supplied (no-op).
 */
export function pasteExtension(callbacks: PasteCallbacks): Extension {
  const { onPasteImage, onPasteHtml, onPasteFile, urlLinkFormatter } = callbacks;
  if (!onPasteImage && !onPasteHtml && !onPasteFile && !urlLinkFormatter) {
    return [];
  }

  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = (event as ClipboardEvent).clipboardData;
      if (!data) return false;
      // A new paste supersedes any outstanding Paste-As offer.
      pendingPasteAs = null;

      // 1. Images — raw binary on the clipboard. Highest priority: a browser
      //    copy of an image also carries text/html + plain (the page URL).
      if (onPasteImage) {
        const imageItems = Array.from(data.items).filter((item) =>
          item.type.startsWith("image/"),
        );
        if (imageItems.length > 0) {
          event.preventDefault();
          const jobs = imageItems.map(async (item) => {
            const file = item.getAsFile();
            if (!file) return null;
            const buf = await file.arrayBuffer();
            return onPasteImage(new Uint8Array(buf), file.name || "pasted-image.png");
          });
          void Promise.all(jobs).then((relPaths) => {
            const inserts = relPaths
              .filter((p): p is string => Boolean(p))
              .map((p) => `![[${p}]]`);
            if (inserts.length > 0) dispatchInsert(view, inserts.join("\n"));
          });
          return true;
        }
      }

      // 2. External files — `file://` entries in the uri-list (paste from the
      //    OS file manager). Non-file URIs (http…) fall through to text paths.
      if (onPasteFile) {
        const files = extractFileUris(data);
        if (files.length > 0) {
          event.preventDefault();
          const jobs = files.map(async ({ uri, filename }) =>
            onPasteFile(uri, filename),
          );
          void Promise.all(jobs).then((inserts) => {
            const text = inserts
              .filter((t): t is string => Boolean(t))
              .join("\n");
            if (text) dispatchInsert(view, text);
            else dispatchPlainFallback(view, data);
          });
          return true;
        }
      }

      // 3. HTML — rich content pasted from browsers/apps. The feature layer
      //    converts to Markdown; the paste mode decides the default insert,
      //    and when plain text genuinely differs an inline Paste-As chooser
      //    offers the alternative afterwards.
      const html = data.getData("text/html");
      if (html && onPasteHtml) {
        event.preventDefault();
        const plain = data.getData("text/plain");
        void onPasteHtml(html).then((md) => {
          if (!md) {
            dispatchPlainFallback(view, data);
            return;
          }
          const mode = callbacks.getPasteMode?.() ?? "smart";
          const choices = buildRichPasteChoices(md, plain, mode);
          if (choices.ambiguous && callbacks.onAmbiguousPaste) {
            insertRichWithPicker(view, md, plain, choices, callbacks.onAmbiguousPaste);
          } else if (choices.lead === "keep-formatting") {
            dispatchInsert(view, md);
          } else {
            dispatchPlainFallback(view, data);
          }
        });
        return true;
      }

      // 4. Smart URL wrap — pasting a URL turns the selection into a link
      //    (Obsidian smart paste). The formatter owns the policy: it may
      //    decline (null → default plain paste) or, in "always" mode, wrap a
      //    bare URL with no selection (`[url](url)`).
      const plain = data.getData("text/plain");
      if (plain && urlLinkFormatter && looksLikeUri(plain.trim())) {
        const { from, to } = view.state.selection.main;
        const selected = view.state.sliceDoc(from, to);
        const insert = urlLinkFormatter(plain.trim(), selected);
        if (insert) {
          event.preventDefault();
          view.dispatch({ changes: { from, to, insert } });
          return true;
        }
      }

      return false;
    },
  });
}

/** Insert text at the current selection head — one undo step. */
function dispatchInsert(view: EditorView, text: string) {
  view.dispatch({
    changes: { from: view.state.selection.main.head, insert: text },
  });
}

/** Whatever CM would do for plain text (used when an async converter declines). */
function dispatchPlainFallback(view: EditorView, data: DataTransfer) {
  const plain = data.getData("text/plain") ?? "";
  view.dispatch(view.state.replaceSelection(plain));
}

/** `file://` entries from a uri-list, decoded to a filename each. */
export function extractFileUris(data: DataTransfer): Array<{ uri: string; filename: string }> {
  const raw = data.getData("text/uri-list");
  if (!raw) return [];
  const out: Array<{ uri: string; filename: string }> = [];
  for (const line of raw.split("\n")) {
    const uri = line.trim();
    if (!uri || uri.startsWith("#") || !uri.startsWith("file://")) continue;
    const decoded = decodeURIComponent(uri.replace(/^file:\/\//, ""));
    const filename = decoded.split(/[\\/]/).pop() || "file";
    out.push({ uri, filename });
  }
  return out;
}

/** Broad URI scheme test — http(s), mailto, ftp, etc. */
export function looksLikeUri(text: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
}

export interface RichPasteChoices {
  /** Flavor the active paste mode prefers. */
  lead: PasteRichChoice;
  /** The alternative the Paste-As picker offers. */
  alternative: PasteRichChoice;
  /** True when both flavors exist, are non-empty, and differ. */
  ambiguous: boolean;
}

/**
 * Decide how a rich paste resolves given the Mode setting. "Smart" and
 * "Keep formatting" lead with the converted Markdown; "Plain text" leads
 * with the plain clipboard text. Non-ambiguous richer content (no usable
 * plain counterpart) always goes rich, whatever the mode — otherwise
 * plain-paste would silent-delete the selection with an empty insert.
 */
export function buildRichPasteChoices(
  md: string,
  plain: string,
  mode: "smart" | "keep-formatting" | "plain-text",
): RichPasteChoices {
  const wantsRich = mode !== "plain-text";
  const plainTrim = plain.trim();
  const mdTrim = md.trim();
  const hasRich = mdTrim.length > 0;
  const hasPlain = plainTrim.length > 0;
  const effectiveRich = wantsRich || (!hasPlain && hasRich);
  const lead: PasteRichChoice = effectiveRich
    ? "keep-formatting"
    : "plain-text";
  const alternative: PasteRichChoice = effectiveRich
    ? "plain-text"
    : "keep-formatting";
  const ambiguous = hasRich && hasPlain && plainTrim !== mdTrim;
  return { lead, alternative, ambiguous };
}

/** Insert the default flavor immediately (one undo step) and offer the
 *  alternative via the host's Paste-As chooser. */
function insertRichWithPicker(
  view: EditorView,
  md: string,
  plain: string,
  choices: RichPasteChoices,
  onAmbiguousPaste: NonNullable<PasteCallbacks["onAmbiguousPaste"]>,
) {
  const { from, to } = view.state.selection.main;
  const leadText = choices.lead === "keep-formatting" ? md : plain;
  const alternative =
    choices.alternative === "keep-formatting" ? md : plain;

  const pending: PendingPasteAs = {
    view,
    from,
    to,
    inserted: leadText,
    alternative,
    defaultId: choices.lead,
  };
  pendingPasteAs = pending;

  view.dispatch({ changes: { from, to, insert: leadText } });

  const anchor = pasteAnchor(view, from);
  const request: AmbiguousPasteRequest = {
    options: [
      { id: "keep-formatting", label: "Keep formatting" },
      { id: "plain-text", label: "Plain text" },
    ],
    defaultId: choices.lead,
    anchor,
  };
  onAmbiguousPaste(request, (id) => applyPasteAsChoice(pending, id));
}

/** Swap the just-inserted paste for the alternative flavor, only while the
 *  range still holds exactly what we wrote (user hasn't kept typing there). */
function applyPasteAsChoice(pending: PendingPasteAs, id: PasteRichChoice | null) {
  if (pendingPasteAs !== pending) return;
  pendingPasteAs = null;
  if (id === null || id === pending.defaultId) return;
  try {
    const current = pending.view.state.sliceDoc(pending.from, pending.to);
    if (current !== pending.inserted) return;
    pending.view.dispatch({
      changes: {
        from: pending.from,
        to: pending.to,
        insert: pending.alternative,
      },
    });
  } catch {
    // View closed — nothing to swap.
  }
}

/** Page coordinates just below the paste point, for the floating chooser. */
function pasteAnchor(view: EditorView, pos: number): { x: number; y: number } {
  const rect = view.coordsAtPos(pos);
  if (rect) return { x: rect.left, y: rect.bottom };
  const dom = view.dom.getBoundingClientRect();
  return { x: dom.left, y: dom.top };
}