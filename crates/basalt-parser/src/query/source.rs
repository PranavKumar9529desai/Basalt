use nom::{
    branch::alt,
    bytes::complete::{tag, tag_no_case, take_while1},
    character::complete::{char, multispace0, multispace1},
    combinator::map,
    sequence::{delimited, preceded, tuple},
    IResult,
};

use super::ast::*;
use super::expr::quoted_string;

// ---------------------------------------------------------------------------
// Source filters
// ---------------------------------------------------------------------------

fn source_tag(input: &str) -> IResult<&str, SourceFilter> {
    map(
        preceded(
            char('#'),
            take_while1(|c: char| c.is_alphanumeric() || c == '_' || c == '/' || c == '-'),
        ),
        |s: &str| SourceFilter::Tag(s.to_string()),
    )(input)
}

fn source_folder(input: &str) -> IResult<&str, SourceFilter> {
    map(quoted_string, SourceFilter::Folder)(input)
}

fn source_link(input: &str) -> IResult<&str, SourceFilter> {
    map(
        delimited(tag("[["), take_while1(|c: char| c != ']'), tag("]]")),
        |s: &str| SourceFilter::Link(s.to_string()),
    )(input)
}

fn source_primary(input: &str) -> IResult<&str, SourceFilter> {
    alt((source_tag, source_folder, source_link, source_group))(input)
}

fn source_group(input: &str) -> IResult<&str, SourceFilter> {
    delimited(
        preceded(char('('), multispace0),
        source_or,
        preceded(multispace0, char(')')),
    )(input)
}

/// Consume a case-insensitive `keyword` followed by whitespace, returning
/// the input after both.
fn keyword_with_ws<'a>(input: &'a str, kw: &'a str) -> IResult<&'a str, (&'a str, &'a str)> {
    tuple((tag_no_case(kw), multispace1))(input)
}

fn source_not(input: &str) -> IResult<&str, SourceFilter> {
    let input = input.trim_start();
    // Nested NOTs chain: `NOT NOT #tag`.
    if let Ok((rest, _)) = keyword_with_ws(input, "NOT") {
        let (rest, filter) = source_not(rest)?;
        return Ok((rest, SourceFilter::Not(Box::new(filter))));
    }
    source_primary(input)
}

fn source_and(input: &str) -> IResult<&str, SourceFilter> {
    let (mut rest, mut left) = source_not(input)?;
    while let Ok((after, _)) = keyword_with_ws(rest.trim_start(), "AND") {
        let (after, right) = source_not(after)?;
        left = SourceFilter::And(Box::new(left), Box::new(right));
        rest = after;
    }
    Ok((rest, left))
}

fn source_or(input: &str) -> IResult<&str, SourceFilter> {
    let (mut rest, mut left) = source_and(input)?;
    while let Ok((after, _)) = keyword_with_ws(rest.trim_start(), "OR") {
        let (after, right) = source_and(after)?;
        left = SourceFilter::Or(Box::new(left), Box::new(right));
        rest = after;
    }
    Ok((rest, left))
}

pub(super) fn from_clause(input: &str) -> IResult<&str, SourceFilter> {
    preceded(tuple((tag_no_case("FROM"), multispace1)), source_or)(input)
}
