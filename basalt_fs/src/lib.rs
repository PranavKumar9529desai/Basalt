use anyhow::Result;

pub trait FileSystem {
    fn read(&self, path: &str) -> Result<Vec<u8>>;
    fn write(&self, path: &str, data: &[u8]) -> Result<()>;
    fn list(&self, path: &str) -> Result<Vec<String>>;
}
