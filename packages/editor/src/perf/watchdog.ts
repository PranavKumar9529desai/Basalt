/**
 * Main-thread watchdog — rAF heartbeat that detects long tasks.
 *
 * When the main thread is blocked (e.g. infinite loop, heavy synchronous
 * work), the rAF callback fires late. The delta between expected and actual
 * frame time reveals the block duration.
 *
 * Toggle via the `dev:watchdog` command. Stats are written to a temp file
 * via `write_dev_report` so prod runs need no devtools open.
 */

export interface WatchdogEvent {
  timestamp: number;
  durationMs: number;
  stack: string;
}

export interface WatchdogStats {
  active: boolean;
  thresholdMs: number;
  maxBlockMs: number;
  totalBlockedMs: number;
  blockCount: number;
  events: WatchdogEvent[];
}

const MAX_EVENTS = 50;

let rafId = 0;
let lastFrameTime = 0;
let thresholdMs = 100;

const stats: WatchdogStats = {
  active: false,
  thresholdMs: 100,
  maxBlockMs: 0,
  totalBlockedMs: 0,
  blockCount: 0,
  events: [],
};

function tick(now: number): void {
  if (!stats.active) return;

  if (lastFrameTime > 0) {
    const delta = now - lastFrameTime;
    if (delta > thresholdMs) {
      const event: WatchdogEvent = {
        timestamp: now,
        durationMs: delta,
        stack: new Error().stack ?? "",
      };
      stats.events.push(event);
      if (stats.events.length > MAX_EVENTS) stats.events.shift();
      stats.blockCount++;
      stats.totalBlockedMs += delta;
      stats.maxBlockMs = Math.max(stats.maxBlockMs, delta);
      console.warn(`[WATCHDOG] Main thread blocked for ${delta.toFixed(1)}ms`);
      console.trace();
    }
  }

  lastFrameTime = now;
  rafId = requestAnimationFrame(tick);
}

/**
 * Start the watchdog. Fires every rAF frame and warns when the main thread
 * is blocked for longer than `threshold` milliseconds.
 */
export function startWatchdog(threshold = 100): void {
  if (stats.active) return;
  thresholdMs = threshold;
  stats.active = true;
  stats.thresholdMs = threshold;
  stats.maxBlockMs = 0;
  stats.totalBlockedMs = 0;
  stats.blockCount = 0;
  stats.events = [];
  lastFrameTime = 0;
  rafId = requestAnimationFrame(tick);
  console.log(`[WATCHDOG] Started (threshold: ${threshold}ms)`);
}

/** Stop the watchdog and freeze current stats. */
export function stopWatchdog(): void {
  if (!stats.active) return;
  stats.active = false;
  cancelAnimationFrame(rafId);
  console.log(
    `[WATCHDOG] Stopped — ${stats.blockCount} block(s), max ${stats.maxBlockMs.toFixed(1)}ms`,
  );
}

/** Return current stats (active or frozen). */
export function getWatchdogStats(): Readonly<WatchdogStats> {
  return stats;
}

/**
 * Format stats as a markdown report — written to a temp file via
 * `write_dev_report` so prod runs need no devtools open.
 */
export function formatWatchdogReport(s: Readonly<WatchdogStats>): string {
  const rows = s.events.map(
    (e) =>
      `| ${new Date(e.timestamp).toISOString()} | ${e.durationMs.toFixed(1)} |`,
  );

  return [
    "# Main-Thread Watchdog Report",
    "",
    `- timestamp: ${new Date().toISOString()}`,
    `- ua: ${navigator.userAgent}`,
    `- threshold: ${s.thresholdMs}ms`,
    `- active: ${s.active}`,
    "",
    "## Summary",
    "",
    `| metric | value |`,
    `|---|---|`,
    `| blocks | ${s.blockCount} |`,
    `| max block | ${s.maxBlockMs.toFixed(1)}ms |`,
    `| total blocked | ${s.totalBlockedMs.toFixed(1)}ms |`,
    "",
    "## Events",
    "",
    "| timestamp | duration |",
    "|---|---|",
    ...rows,
    "",
  ].join("\n");
}
