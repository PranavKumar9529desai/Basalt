import { basename, normalizePath } from "@workspace/ui";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { CopyAsFormat } from "@workspace/ui/components/file-tree";

export type { CopyAsFormat };

/** A tree node as Copy As sees it — vault-relative path + display name. */
export interface CopyNode {
  /** Vault-relative path including extension, e.g. `notes/My note.md`. */
  relPath: string;
  /** Display name (stem), e.g. `My note`. */
  name: string;
}

/** Path minus its trailing extension, directory segments kept
 *  (`"notes/My note.md"` → `"notes/My note"`). Unlike `stemOf` this keeps
 *  folders — wikilinks and obsidian:// URLs reference the full note path. */
function pathWithoutExt(path: string): string {
  const normalized = normalizePath(path);
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0) return normalized;
  return normalized.slice(0, dotIndex);
}

/**
 * Build the clipboard text for a Copy As format. Vault-name-dependent formats
 * (URL) need the vault root to derive the vault name.
 */
export function buildCopyAsText(
  format: CopyAsFormat,
  node: CopyNode,
  vaultPath: string | null,
): string {
  switch (format) {
    case "wikilink":
      return `[[${pathWithoutExt(node.relPath)}]]`;
    case "markdown":
      return `[${node.name}](${encodeURI(node.relPath)})`;
    case "path":
      return node.relPath;
    case "url": {
      const vault = vaultPath ? encodeURIComponent(basename(vaultPath)) : "";
      const file = encodeURIComponent(pathWithoutExt(node.relPath));
      return `obsidian://open?vault=${vault}&file=${file}`;
    }
  }
}

/** Copy a node to the OS clipboard in the requested format. */
export async function copyNodeAs(
  format: CopyAsFormat,
  node: CopyNode,
  vaultPath: string | null,
): Promise<void> {
  const text = buildCopyAsText(format, node, vaultPath);
  if (!text) return;
  await writeText(text);
}

/** Copy several nodes (e.g. a tree selection) to the OS clipboard. Text is
 *  newline-joined so a file-manager-style Ctrl+C multiline paste is usable
 *  and each line is still a complete path. */
export async function copyPathsAs(
  format: CopyAsFormat,
  nodes: CopyNode[],
  vaultPath: string | null,
): Promise<void> {
  const text = nodes
    .map((node) => buildCopyAsText(format, node, vaultPath))
    .filter(Boolean)
    .join("\n");
  if (text) await writeText(text);
}