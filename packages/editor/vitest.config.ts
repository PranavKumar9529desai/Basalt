import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/_helpers/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Full-production-stack tests (widgets, search, reading mode) build the
    // whole CM6 extension surface; the 5s default trips under CPU contention
    // when suites run in parallel on CI. 15s holds real hangs accountable.
    testTimeout: 15000,
  },
});
