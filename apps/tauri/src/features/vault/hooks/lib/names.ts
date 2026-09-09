import { isMarkdownPath, stemOf } from "@workspace/ui";

/** Inline-name parsing for tree creates/renames: "a/b/New Note" → leaf name
 * + resolved parent path; a trailing "/" marks a folder. Returns null for
 * blank or path-only input. */
export function parseInlineName(
  raw: string,
  baseParent: string | undefined,
): { leaf: string; parentRelPath: string; isFolder: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const isFolder = trimmed.endsWith("/");
  const withoutTrailing = trimmed.replace(/[\\/]+$/, "");
  if (!withoutTrailing) return null;
  const segments = withoutTrailing.split("/").filter(Boolean);
  const leaf = segments.pop();
  if (!leaf) return null;
  const parentSegments = segments;
  if (baseParent)
    parentSegments.unshift(...baseParent.split("/").filter(Boolean));
  return {
    leaf,
    parentRelPath: parentSegments.join("/"),
    isFolder,
  };
}

/** Resolve the name a rename commits to: notes are renamed by stem (the
 * backend re-appends .md); folders and attachments keep the name as typed
 * (backend preserves extensions). */
export function resolveRenameName(
  trimmed: string,
  targetName: string,
  isFolder: boolean,
): string {
  return isFolder || !isMarkdownPath(targetName) ? trimmed : stemOf(trimmed);
}
