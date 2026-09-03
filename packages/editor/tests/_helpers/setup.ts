// Vitest globals + jest-dom matchers for editor tests.
import "@testing-library/jest-dom/vitest";

// jsdom lacks requestIdleCallback, which the editor's PreviewScheduler uses.
// Polyfill it to run the callback synchronously-ish via a macrotask.
if (typeof globalThis.requestIdleCallback !== "function") {
  (globalThis as unknown as { requestIdleCallback: unknown }).requestIdleCallback =
    (cb: IdleRequestCallback) => {
      const start = performance.now();
      const handle = setTimeout(() => {
        cb({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 50 - (performance.now() - start)),
        } as IdleDeadline);
      }, 1);
      return handle as unknown as number;
    };
}

if (typeof globalThis.cancelIdleCallback !== "function") {
  (globalThis as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback =
    (handle: number) => clearTimeout(handle);
}
