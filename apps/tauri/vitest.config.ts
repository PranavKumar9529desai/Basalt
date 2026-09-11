import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Full-stack editor/Modal tests build the entire CM6 extension stack
    // synchronously; the 5s default trips under I/O or CPU contention on CI
    // when suites run in parallel. 15s holds a real hang accountable while
    // absorbing scheduler noise.
    testTimeout: 15000,
  },
});
