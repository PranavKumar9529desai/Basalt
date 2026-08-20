/**
 * WorkspaceInit — Workspace initialization boundary.
 *
 * Architecture: This component owns the ONE-TIME initialization of all features.
 * It receives the raw BootResult from the Rust backend and orchestrates:
 *   1. Settings hydration (initSettings)
 *   2. Tab persistence restore (useTabPersistence)
 *
 * After initialization, all components read from Zustand stores directly.
 * BootResult is a SEED, not a runtime dependency — it flows through here
 * exactly once and is never stored in a Zustand store (no dual source of truth).
 *
 * This component renders WorkspaceView as its ONLY child, passing the full
 * boot object so WorkspaceView can seed useVaultTree(boot.tree). The boot
 * object is NOT stored — it's consumed and discarded.
 *
 * Note: Command registration for vault actions (app:new-file, app:delete-file)
 * stays in WorkspaceView because those commands depend on `controller` from
 * useWorkspace, which is a runtime hook result — not boot data.
 */
import type { BootResult } from "../features/vault";
import { initSettings } from "../features/settings";
import { useTabPersistence } from "../features/tabs";
import { WorkspaceView } from "./WorkspaceView";

interface WorkspaceInitProps {
  boot: BootResult;
}

export function WorkspaceInit({ boot }: WorkspaceInitProps) {
  // ── 1. Settings hydration ────────────────────────────────────────────────
  // Plain function call — reads boot.settings once and writes to the Zustand
  // settings store. Idempotent: calling again with same data is a no-op.
  initSettings(boot.settings);

  // ── 2. Tab persistence ───────────────────────────────────────────────────
  // Restores the previous session's tab layout from boot.workspace on mount,
  // then debounces saves back to Rust on structural mutations.
  // Needs boot.workspace to seed the hydration — cannot be moved to stores.
  useTabPersistence({ workspace: boot.workspace });

  // ── Render ───────────────────────────────────────────────────────────────
  // WorkspaceView is a pure layout — reads from stores, receives boot for
  // vault tree initialization (useVaultTree needs boot.tree).
  return <WorkspaceView boot={boot} />;
}
