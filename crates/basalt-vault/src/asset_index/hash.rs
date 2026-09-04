/// Compute MD5 hex-digest of a byte slice.
pub fn compute_md5(data: &[u8]) -> String {
    let digest = md5::compute(data);
    format!("{:x}", digest)
}
