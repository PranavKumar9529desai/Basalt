/// <reference types="vite/client" />
// vite-plugin-wasm: `?init` default export instantiates a wasm module and
// returns its exports. Declared here so the worker's import type-checks.
declare module "*.wasm?init" {
  const init: (input?: unknown) => Promise<Record<string, unknown>>;
  export default init;
}
