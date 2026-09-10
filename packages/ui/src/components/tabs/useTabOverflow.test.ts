// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabOverflow } from "./useTabOverflow";
import type { TabItemData } from "./types";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("useTabOverflow", () => {
  const createMockTabs = (count: number, activeIndex = 0): TabItemData[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `tab-${i}`,
      title: `Tab ${i}`,
      isActive: i === activeIndex,
    }));

  it("handles empty tab array", () => {
    const { result } = renderHook(() => useTabOverflow([]));
    expect(result.current.visibleTabCount).toBe(0);
    expect(result.current.visibleTabStart).toBe(0);
  });

  it("makes all tabs visible when container has sufficient width", () => {
    const tabs = createMockTabs(5, 0);
    const { result, rerender } = renderHook(({ t }) => useTabOverflow(t), {
      initialProps: { t: tabs },
    });

    const mockContainer = { clientWidth: 1000 } as HTMLDivElement;
    Object.defineProperty(result.current.containerRef, "current", {
      value: mockContainer,
      configurable: true,
    });

    tabs.forEach((tab) => {
      result.current.tabRefs.current.set(tab.id, {
        offsetWidth: 150,
      } as HTMLDivElement);
    });

    act(() => {
      rerender({ t: [...tabs] });
    });

    expect(result.current.visibleTabStart).toBe(0);
    expect(result.current.visibleTabCount).toBe(5);
  });

  it("fits maximum possible tabs into available container width without false overflow", () => {
    const tabs = createMockTabs(6, 3); // 6 tabs, active is tab-3
    const { result, rerender } = renderHook(({ t }) => useTabOverflow(t), {
      initialProps: { t: tabs },
    });

    // 700px container width: can fit 4 tabs @ 160px each (4 * 160 = 640 <= 700)
    const mockContainer = { clientWidth: 700 } as HTMLDivElement;
    Object.defineProperty(result.current.containerRef, "current", {
      value: mockContainer,
      configurable: true,
    });

    tabs.forEach((tab) => {
      result.current.tabRefs.current.set(tab.id, {
        offsetWidth: 160,
      } as HTMLDivElement);
    });

    act(() => {
      rerender({ t: [...tabs] });
    });

    // With active tab at index 3, 4 tabs fit
    expect(result.current.visibleTabCount).toBeGreaterThanOrEqual(4);
    // Active tab (index 3) must be in visible range [start, start + count)
    expect(3).toBeGreaterThanOrEqual(result.current.visibleTabStart);
    expect(3).toBeLessThan(
      result.current.visibleTabStart + result.current.visibleTabCount,
    );
  });

  it("ensures active tab at the end of the list is visible", () => {
    const tabs = createMockTabs(6, 5); // active is last tab (index 5)
    const { result, rerender } = renderHook(({ t }) => useTabOverflow(t), {
      initialProps: { t: tabs },
    });

    const mockContainer = { clientWidth: 500 } as HTMLDivElement;
    Object.defineProperty(result.current.containerRef, "current", {
      value: mockContainer,
      configurable: true,
    });

    tabs.forEach((tab) => {
      result.current.tabRefs.current.set(tab.id, {
        offsetWidth: 160,
      } as HTMLDivElement);
    });

    act(() => {
      rerender({ t: [...tabs] });
    });

    // 500px container: fits min(6, floor(500/90)) = 5 tabs!
    expect(result.current.visibleTabCount).toBe(5);
    // start should be 1, visible tabs: [1, 2, 3, 4, 5]
    expect(result.current.visibleTabStart).toBe(1);
    expect(
      result.current.visibleTabStart + result.current.visibleTabCount,
    ).toBe(6);
  });

  it("ensures active tab at the beginning of the list is visible", () => {
    const tabs = createMockTabs(6, 0); // active is first tab (index 0)
    const { result, rerender } = renderHook(({ t }) => useTabOverflow(t), {
      initialProps: { t: tabs },
    });

    const mockContainer = { clientWidth: 500 } as HTMLDivElement;
    Object.defineProperty(result.current.containerRef, "current", {
      value: mockContainer,
      configurable: true,
    });

    act(() => {
      rerender({ t: [...tabs] });
    });

    expect(result.current.visibleTabCount).toBe(5);
    expect(result.current.visibleTabStart).toBe(0);
  });
});
