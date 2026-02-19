use wasm_bindgen::prelude::*;
use basalt_core::process_markdown;

#[wasm_bindgen]
pub struct Basalt {
}

#[wasm_bindgen]
impl Basalt {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {}
    }

    pub fn render_markdown(&self, input: &str) -> String {
        let processed = process_markdown(input);
        processed.html
    }
}
