use basalt_core::{extract_metadata, process_markdown, search_commands};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Basalt {}

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

    pub fn extract_metadata(&self, input: &str) -> Result<JsValue, JsValue> {
        let meta = extract_metadata(input);
        serde_wasm_bindgen::to_value(&meta).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn fuzzy_search_commands(
        &self,
        query: &str,
        candidates: JsValue,
    ) -> Result<JsValue, JsValue> {
        let candidates: Vec<(String, String)> = serde_wasm_bindgen::from_value(candidates)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let results = search_commands(query, candidates);
        serde_wasm_bindgen::to_value(&results).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}
