import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
plugins: [TanStackRouterVite(), react(), wasm()],
    worker: { format: "es" },

  build: {
    // Desktop app: chunks load from local disk, no HTTP cache concerns.
    // Vendor separation = parallel parse of independent chunks at startup
    // and a smaller entry chunk (ADR-020 move 3).
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Precise matches — a broad `includes("react")` would sweep
          // @tanstack/react-* and friends into the React chunk.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id))
            return "react-vendor";
          // Core CM only. Three traps live here (all verified the hard way):
          //  - @codemirror/lang-*  → lazy mode wrappers
          //  - language-data       → dynamic-import hub (issue rollup#5627:
          //    hub in a manual chunk merges every mode in with it)
          //  - legacy-modes        → ~80 stream-language modes
          //  - @lezer/<language>   → generated parser tables (BIG); only
          //    common/lr/highlight are true core.
          if (
            /[\\/]node_modules[\\/]@codemirror[\\/](?!lang-|language-data|legacy-modes)/.test(
              id,
            ) ||
            /[\\/]node_modules[\\/]@lezer[\\/](common|lr|highlight)[\\/]/.test(
              id,
            ) ||
            /[\\/]node_modules[\\/](@uiw|codemirror)[\\/]/.test(id) ||
            /[\\/]node_modules[\\/](style-mod|w3c-keyname|crelt)[\\/]/.test(id)
          )
            return "codemirror-vendor";
          if (/[\\/]node_modules[\\/]@tabler[\\/]/.test(id)) return "icons";
          return undefined; // let Rollup place the rest (app code stays in entry)
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
