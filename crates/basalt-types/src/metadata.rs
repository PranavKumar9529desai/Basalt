use serde::{Deserialize, Serialize};

use crate::task::TaskData;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
pub struct FileMetadata {
    #[serde(default, with = "frontmatter_serde")]
    pub frontmatter: Option<serde_yaml_ng::Value>,
    pub tags: Vec<String>,
    pub links: Vec<String>,
    /// Embed targets (`![[image.png]]`). Separate from `links` (`[[Note]]`)
    /// so consumers can distinguish a note reference from a media embed.
    pub embeds: Vec<String>,
    /// Property names declared as `aliases:` in frontmatter (Obsidian alternate
    /// note names). Extracted from the parsed YAML so the app can surface them.
    pub aliases: Vec<String>,

    // UI tracking data uses UTF-16 code unit offsets for CodeMirror
    pub tag_locations: Vec<(String, Span)>,
    pub link_locations: Vec<(String, Span)>,
    pub embed_locations: Vec<(String, Span)>,
    pub headings: Vec<(u8, String, Span)>,
    pub block_ids: Vec<(String, Span)>,

    /// Tasks extracted from markdown checkbox lines during the same scan pass.
    /// `#[serde(default)]` keeps old bincode caches (written before this
    /// field existed) deserializing to an empty Vec — no cache invalidation.
    #[serde(default)]
    pub tasks: Vec<TaskData>,
}

impl FileMetadata {
    pub fn new() -> Self {
        Self::default()
    }
}

mod frontmatter_serde {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(
        val: &Option<serde_yaml_ng::Value>,
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match val {
            Some(v) => {
                let json = serde_json::to_string(v).map_err(serde::ser::Error::custom)?;
                serializer.serialize_some(&json)
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<serde_yaml_ng::Value>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let opt: Option<String> = Option::deserialize(deserializer)?;
        match opt {
            Some(json) => {
                let val: serde_yaml_ng::Value =
                    serde_json::from_str(&json).map_err(serde::de::Error::custom)?;
                Ok(Some(val))
            }
            None => Ok(None),
        }
    }
}

