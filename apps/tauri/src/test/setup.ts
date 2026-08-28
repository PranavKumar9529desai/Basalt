import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver, which @tanstack/react-virtual depends on.
// Fire the callback once on observe so the virtualizer actually measures the
// scroll element and renders its rows.
class ResizeObserverStub {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element) {
    this.cb(
      [
        {
          target: el,
          contentRect: el.getBoundingClientRect(),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver =
  globalThis.ResizeObserver ??
  (ResizeObserverStub as unknown as typeof ResizeObserver);
