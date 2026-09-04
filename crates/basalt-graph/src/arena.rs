use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Index of an interned string in a [`StringArena`].
///
/// A newtype over `u32` so a raw integer can't accidentally be used where a
/// node id is expected. `#[serde(transparent)]` keeps the wire/cache format as
/// a plain JSON number, so the on-disk `VaultCache` layout is unchanged.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[serde(transparent)]
pub struct NodeId(pub u32);

impl NodeId {
    pub const fn new(id: u32) -> Self {
        NodeId(id)
    }
}

impl From<u32> for NodeId {
    fn from(id: u32) -> Self {
        NodeId(id)
    }
}

impl std::fmt::Display for NodeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// An append-only string interner.
/// Serializes only `id_to_string`; `string_to_id` is rebuilt on deserialize.
#[derive(Debug, Default, Serialize)]
pub struct StringArena {
    id_to_string: Vec<String>,
    #[serde(skip)]
    string_to_id: HashMap<String, NodeId>,
}

impl<'de> Deserialize<'de> for StringArena {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        // Only the Vec is stored on disk; rebuild the reverse map from it.
        #[derive(Deserialize)]
        struct Raw {
            id_to_string: Vec<String>,
        }
        let raw = Raw::deserialize(deserializer)?;
        let string_to_id = raw
            .id_to_string
            .iter()
            .enumerate()
            .map(|(i, s)| (s.clone(), NodeId::new(i as u32)))
            .collect();
        Ok(StringArena {
            id_to_string: raw.id_to_string,
            string_to_id,
        })
    }
}

impl StringArena {
    pub fn new() -> Self {
        Self {
            id_to_string: Vec::new(),
            string_to_id: HashMap::new(),
        }
    }

    pub fn get_or_insert(&mut self, s: &str) -> NodeId {
        if let Some(&id) = self.string_to_id.get(s) {
            return id;
        }
        let new_id = NodeId::new(self.id_to_string.len() as u32);
        let owned = s.to_string();
        self.id_to_string.push(owned);
        self.string_to_id.insert(s.to_string(), new_id);
        new_id
    }

    pub fn get_id(&self, s: &str) -> Option<NodeId> {
        self.string_to_id.get(s).copied()
    }

    pub fn get_string(&self, id: NodeId) -> Option<&String> {
        self.id_to_string.get(id.0 as usize)
    }

    pub fn len(&self) -> usize {
        self.id_to_string.len()
    }

    pub fn is_empty(&self) -> bool {
        self.id_to_string.is_empty()
    }

    /// Returns all interned strings in insertion order.
    pub fn all_strings(&self) -> impl Iterator<Item = &String> {
        self.id_to_string.iter()
    }
}
