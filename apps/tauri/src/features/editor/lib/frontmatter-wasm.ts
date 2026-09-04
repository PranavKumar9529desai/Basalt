import init from "../components/frontmatter.wasm?init";
import type { FrontmatterModel } from "@workspace/editor";

type FmExports = {
  fm_alloc(capacity: number): number;
  fm_parse(input_offset: number, input_len: number): number;
  fm_ptr(): number;
  fm_len(): number;
  memory: WebAssembly.Memory;
};

let ex: FmExports | null = null;
let ready: Promise<void> | null = null;
let failed = false;

/**
 * Load the frontmatter engine WASM (ADR-022 rule 2). Idempotent; safe to call
 * from many tabs. The boot race is handled by awaiting this BEFORE creating an
 * EditorState that could contain frontmatter (see EditorView.showTab).
 */
export async function initFrontmatterWasm(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    // vite-plugin-wasm's `?init` resolves to the WebAssembly.Instance; the
    // C-ABI functions (and `memory`) live on `instance.exports`.
    const instance = (await init()) as unknown as WebAssembly.Instance;
    ex =
      (instance.exports as unknown as FmExports) ??
      (instance as unknown as FmExports);
  })().catch((err) => {
    failed = true;
    console.error("[frontmatter-wasm] init failed:", err);
  });
  return ready;
}

/**
 * Synchronous YAML-frontmatter parse (ADR-022 rule 2/4): the keystroke-path
 * parser. Runs inside the decoration state field on the same transaction that
 * changed the frontmatter, so the per-view model is always fresh and surgical
 * span edits re-render without a round trip. Returns null when WASM isn't
 * loaded yet or the text has no frontmatter.
 */
export function parseFrontmatterSync(text: string): FrontmatterModel | null {
  if (!ex) return null;
  const encoded = new TextEncoder().encode(text);
  const ptr = ex.fm_alloc(encoded.length);
  const mem = ex.memory.buffer;
  new Uint8Array(mem, ptr, encoded.length).set(encoded);
  try {
    const len = ex.fm_parse(ptr, encoded.length);
    if (typeof len !== "number" || len === 0) return null;
    // Re-fetch the buffer after the call: wasm may have grown memory.
    const out = new Uint8Array(ex.memory.buffer, ex.fm_ptr(), len);
    return JSON.parse(new TextDecoder().decode(out)) as FrontmatterModel;
  } catch (err) {
    if (!failed) {
      failed = true;
      console.error("[frontmatter-wasm] parse failed:", err);
    }
    return null;
  }
}
