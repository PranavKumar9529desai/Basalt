import { AssetsView as AssetsPanel } from "../../features/assets";

/**
 * Assets view — the right dock's registered view.
 * Self-contained: reads its own store, fetches data on mount.
 */
export function AssetsView() {
  return <AssetsPanel />;
}
