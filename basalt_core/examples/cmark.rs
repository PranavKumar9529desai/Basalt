use pulldown_cmark::{Parser, Event};

fn main() {
    let input = "This is a [[WikiLink]] and a #tag.";
    for e in Parser::new(input) {
        println!("{:?}", e);
    }
}
