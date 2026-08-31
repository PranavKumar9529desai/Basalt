/**
 * Boot — Workspace initialization boundary.
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
 * This component renders Shell as its ONLY child, passing the full
 * boot object so Shell can seed useVaultTree(boot.tree). The boot
 * object is NOT stored — it's consumed and discarded.
 *
 * Note: Command registration for vault actions (app:new-file, app:delete-file)
 * stays in Shell because those commands depend on `controller` from
 * useWorkspace, which is a runtime hook result — not boot data.
 */
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { BootResult } from "../features/vault";
import { initSettings } from "../features/settings";
import { useTabPersistence } from "../features/tabs";
import { ttiMark, writeTtiReport } from "./tti";
import { Shell } from "./Shell";

interface BootProps {
  boot: BootResult;
}

export function Boot({ boot }: BootProps) {
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
    ttiMark("mount_effect");
    getCurrentWindow()
      .show()
      .then(() => {
        // Gap between show-resolved and the paint mark = window-mapping /
        // compositor latency (WM map, first frame after reveal). If large,
        // the paint tail is reveal cost, not React work.
        ttiMark("show_resolved");
      })
      .catch((err) => {
        // Missing capability etc. must never fail silently — the 10s Rust
        // failsafe would mask it as "slow boot" (see TTI run 18:10/18:15).
        console.error("[Boot] window.show() failed:", err);
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
        const idle =
          window.requestIdleCallback ??
          ((cb: () => void) => setTimeout(cb, 200));
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

  // Shell is a pure layout — reads from stores, receives boot for
  // vault tree initialization (useVaultTree needs boot.tree).
  return <Shell boot={boot} />;
}
