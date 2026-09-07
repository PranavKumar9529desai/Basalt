use super::super::plan::parse_query;

#[test]
fn parse_bad_syntax() {
    assert!(parse_query("BANANA").is_err());
}
