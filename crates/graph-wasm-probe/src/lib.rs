// Phase-0 de-risk probe: proves the cargo -> wasm32-unknown-unknown toolchain
// produces a wasm module that loads and executes inside a Tauri web worker.
// Not used by the real graph renderer (that path is `basalt-wasm`).

/// Sum two integers — exercises the C ABI export surface from Rust->wasm.
#[no_mangle]
pub extern "C" fn probe_add(a: i32, b: i32) -> i32 {
    a + b
}

/// Constant the spike asserts on, to confirm the wasm actually executed.
#[no_mangle]
pub extern "C" fn probe_magic() -> i32 {
    42
}
