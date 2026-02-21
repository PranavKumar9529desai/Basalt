use pulldown_cmark::{Event, Parser};

fn main() {
    let input = "This is a [[WikiLink]] and a #tag.";
    for e in Parser::new(input) {
        println!("{:?}", e);
    }
}
