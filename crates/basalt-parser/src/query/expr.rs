use nom::{
    branch::alt,
    bytes::complete::{tag, tag_no_case, take_while1},
    character::complete::{char, multispace0},
    combinator::{map, opt, value, verify},
    multi::{many0, separated_list0},
    number::complete::double,
    sequence::{delimited, pair, preceded, tuple},
    IResult,
};

use super::ast::*;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DQL_KEYWORDS: &[&str] = &[
    "from", "where", "sort", "limit", "group", "flatten", "asc", "desc", "as", "table", "list",
    "task", "and", "or", "not", "contains", "true", "false", "null",
];

fn is_keyword(s: &str) -> bool {
    DQL_KEYWORDS.contains(&s.to_ascii_lowercase().as_str())
}

/// An identifier: alphanumeric, underscore, hyphen. No dots — dots are field separators.
fn is_ident_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-'
}

// ---------------------------------------------------------------------------
// Expression parsers
// ---------------------------------------------------------------------------

pub(super) fn field_ref(input: &str) -> IResult<&str, FieldRef> {
    let (input, first) = field_first_segment(input)?;
    let (input, rest) = many0(map(
        preceded(char('.'), take_while1(is_ident_char)),
        |s: &str| s.to_string(),
    ))(input)?;
    let mut parts = Vec::with_capacity(rest.len() + 1);
    parts.push(first);
    parts.extend(rest);
    Ok((input, FieldRef(parts)))
}

/// The first segment of a field path. A non-keyword ident is always valid; a
/// DQL keyword is valid only when it begins a dotted path (`task.complete`),
/// so a standalone command keyword (`FROM` in `TABLE FROM #x`) is still
/// rejected as a field and command detection is unaffected.
fn field_first_segment(input: &str) -> IResult<&str, String> {
    let (rest, name) = take_while1(is_ident_char)(input)?;
    if is_keyword(name) && !rest.starts_with('.') {
        return Err(nom::Err::Error(nom::error::Error::new(
            input,
            nom::error::ErrorKind::Fail,
        )));
    }
    Ok((rest, name.to_string()))
}
// Function-call names: alphanumeric + underscore, must start with a letter or
// underscore. Unlike `ident`, keywords are allowed — `contains` is a DQL
// keyword but a legal function name here.
fn fn_name(input: &str) -> IResult<&str, String> {
    map(
        verify(
            take_while1(|c: char| c.is_alphanumeric() || c == '_'),
            |s: &str| {
                s.chars()
                    .next()
                    .is_some_and(|c| c.is_alphabetic() || c == '_')
            },
        ),
        |s: &str| s.to_string(),
    )(input)
}

/// A function call like `contains(field, "needle")` or `sum(rows.priority)`.
/// Arguments are expressions, so calls nest. Names are normalized to
/// lowercase so engine dispatch is case-stable.
fn call(input: &str) -> IResult<&str, Expr> {
    map(
        pair(
            fn_name,
            delimited(
                char('('),
                separated_list0(tuple((multispace0, char(','), multispace0)), simple_expr),
                char(')'),
            ),
        ),
        |(name, args)| Expr::Func {
            name: name.to_ascii_lowercase(),
            args,
        },
    )(input)
}

pub(super) fn quoted_string(input: &str) -> IResult<&str, String> {
    delimited(
        char('"'),
        map(take_while1(|c: char| c != '"'), |s: &str| s.to_string()),
        char('"'),
    )(input)
}

fn literal(input: &str) -> IResult<&str, Literal> {
    alt((
        value(Literal::Bool(true), tag_no_case("true")),
        value(Literal::Bool(false), tag_no_case("false")),
        value(Literal::Null, tag_no_case("null")),
        map(quoted_string, Literal::Text),
        map(double, Literal::Number),
    ))(input)
}

fn compare_op(input: &str) -> IResult<&str, CompareOp> {
    alt((
        value(CompareOp::Le, tag("<=")),
        value(CompareOp::Ge, tag(">=")),
        value(CompareOp::Ne, tag("!=")),
        value(CompareOp::Eq, tag("=")),
        value(CompareOp::Lt, char('<')),
        value(CompareOp::Gt, char('>')),
    ))(input)
}

pub(super) fn simple_expr(input: &str) -> IResult<&str, Expr> {
    alt((
        map(literal, Expr::Literal),
        // Call must precede field_ref: a non-keyword name like `length`
        // would otherwise parse as a field and leave the `(` unconsumed.
        call,
        paren_expr,
        map(field_ref, Expr::Field),
    ))(input)
}

pub(super) fn where_expr(input: &str) -> IResult<&str, Expr> {
    let (input, left) = simple_expr(input)?;
    // Consume an optional comparison clause. We deliberately do NOT eat the
    // trailing whitespace when there's no comparison, so the data-command
    // separator (multispace1) can still match the next command
    // (`WHERE x GROUP BY y`).
    match opt(compare_clause)(input)? {
        (input, Some((op, right))) => Ok((
            input,
            Expr::Comparison {
                left: Box::new(left),
                op,
                right: Box::new(right),
            },
        )),
        (input, None) => Ok((input, left)),
    }
}

fn compare_clause(input: &str) -> IResult<&str, (CompareOp, Expr)> {
    let (input, _) = multispace0(input)?;
    let (input, op) = compare_op(input)?;
    let (input, _) = multispace0(input)?;
    let (input, right) = simple_expr(input)?;
    Ok((input, (op, right)))
}
/// A parenthesized expression: `(expr)` — the shape needed for computed
/// GROUP BY / FLATTEN keys, usable anywhere a simple expression is valid.
fn paren_expr(input: &str) -> IResult<&str, Expr> {
    delimited(
        preceded(char('('), multispace0),
        where_expr,
        preceded(multispace0, char(')')),
    )(input)
}
