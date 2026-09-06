import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ensureMediaServerUrl, ttiMark } from "../shared";
import { Boot } from "../shared/Boot";
import type { BootResult } from "../features/vault";

interface LoaderData {
  boot: BootResult;
}

export const Route = createFileRoute("/")({
  loader: async (): Promise<LoaderData> => {
    ttiMark("loader_start");
    const bootPromise = invoke<BootResult>("boot");
    // Fire the loopback media-server fetch in parallel — off the TTI path.
    // Linux embeds need the URL before first paint; other platforms no-op.
    void ensureMediaServerUrl();
    const boot = await bootPromise;
    ttiMark("boot_resolved");
    return { boot };
  },
  pendingComponent: () => (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-[var(--sat-text-muted)]">
      <div className="w-5 h-5 border-2 border-[var(--sat-text-muted)] border-t-[var(--sat-accent-primary)] rounded-full animate-spin" />
      <span className="text-sm text-[var(--sat-text-primary)]">
        Loading vault…
      </span>
    </div>
  ),

  component: function RouteComponent() {
    const { boot } = Route.useLoaderData();
    return <Boot boot={boot} />;
  },
});
