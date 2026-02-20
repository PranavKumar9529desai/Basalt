use std::collections::HashMap;

pub type NodeId = u32;

#[derive(Debug, Default)]
pub struct StringArena {
    id_to_string: Vec<String>,
    string_to_id: HashMap<String, NodeId>,
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

        let new_id = self.id_to_string.len() as NodeId;
        self.id_to_string.push(s.to_string());
        self.string_to_id.insert(s.to_string(), new_id);
        
        new_id
    }

    pub fn get_id(&self, s: &str) -> Option<NodeId> {
        self.string_to_id.get(s).copied()
    }

    pub fn get_string(&self, id: NodeId) -> Option<&String> {
        self.id_to_string.get(id as usize)
    }
}
