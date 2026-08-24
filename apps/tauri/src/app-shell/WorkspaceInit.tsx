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
 * useWorkspaceController, which is a runtime hook result — not boot data.
 */
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { BootResult } from "../features/vault";
import { initSettings } from "../features/settings";
import { useTabPersistence } from "../features/tabs";
import { ttiMark, writeTtiReport } from "./tti";
import { WorkspaceView } from "./WorkspaceView";

interface WorkspaceInitProps {
  boot: BootResult;
}

export function WorkspaceInit({ boot }: WorkspaceInitProps) {
  // Plain function call — reads boot.settings once and writes to the Zustand
  // settings store. Idempotent: calling again with same data is a no-op.
  initSettings(boot.settings);

  // Restores the previous session's tab layout from boot.workspace on mount,
  // then debounces saves back to Rust on structural mutations.
  // Needs boot.workspace to seed the hydration — cannot be moved to stores.
  useTabPersistence({ workspace: boot.workspace });

  // TTI + window reveal. Show the window as soon as the workspace DOM is
  // committed — do NOT gate show() on requestAnimationFrame: WebKit suspends
  // rAF for hidden windows, so waiting-for-paint-to-show deadlocks until the
  // 10s Rust failsafe (observed in the 2026-08-24 TTI run: painted @ 9997ms).
  // rAF is still used AFTER show() to timestamp the first real painted frame.
  useEffect(() => {
    getCurrentWindow()
      .show()
      .catch((err) => {
        // Missing capability etc. must never fail silently — the 10s Rust
        // failsafe would mask it as "slow boot" (see TTI run 18:10/18:15).
        console.error("[WorkspaceInit] window.show() failed:", err);
      });
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        ttiMark("workspace_painted");
        void writeTtiReport({
          status: boot.status,
          note_count: boot.note_count,
          timings: boot.timings,
        });
        // Overlay chunks (search/quick-switcher/settings) are lazy — pull
        // them from disk during idle so first open is instant.
        const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
        idle(() => {
          void import("../features/search");
          void import("../features/settings");
        });
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [boot]);

  // WorkspaceView is a pure layout — reads from stores, receives boot for
  // vault tree initialization (useVaultTree needs boot.tree).
  return <WorkspaceView boot={boot} />;
}
