use anyhow::Result;
use basalt_core::arena::StringArena;
use basalt_core::graph::NoteGraph;

pub mod indexer;

pub trait FileSystem {
    fn read(&self, path: &str) -> Result<Vec<u8>>;
    fn write(&self, path: &str, data: &[u8]) -> Result<()>;
    fn list(&self, path: &str) -> Result<Vec<String>>;
}

#[derive(Debug, Default)]
pub struct Vault {
    pub arena: StringArena,
    pub graph: NoteGraph,
}

impl Vault {
    pub fn new() -> Self {
        Self {
            arena: StringArena::new(),
            graph: NoteGraph::new(),
        }
    }
}
