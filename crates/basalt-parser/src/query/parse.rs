use nom::{
    branch::alt,
    bytes::complete::{tag, tag_no_case, take_while1},
    character::complete::{char, digit1, multispace0, multispace1},
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
// Parsers
// ---------------------------------------------------------------------------

fn field_ref(input: &str) -> IResult<&str, FieldRef> {
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

fn query_type(input: &str) -> IResult<&str, QueryType> {
    alt((
        value(QueryType::Table, tag_no_case("TABLE")),
        value(QueryType::List, tag_no_case("LIST")),
        value(QueryType::Task, tag_no_case("TASK")),
    ))(input)
}

fn quoted_string(input: &str) -> IResult<&str, String> {
    delimited(
        char('"'),
        map(take_while1(|c: char| c != '"'), |s: &str| s.to_string()),
        char('"'),
    )(input)
}

/// An optional `AS "alias"` clause, shared by TABLE fields, GROUP BY and FLATTEN.
fn alias_clause(input: &str) -> IResult<&str, String> {
    preceded(
        tuple((multispace1, tag_no_case("AS"), multispace1)),
        quoted_string,
    )(input)
}

fn query_field(input: &str) -> IResult<&str, QueryField> {
    let (input, expr) = simple_expr(input)?;
    let (input, alias) = opt(alias_clause)(input)?;
    Ok((input, QueryField { expr, alias }))
}

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

fn source_not(input: &str) -> IResult<&str, SourceFilter> {
    let trimmed = input.trim_start();
    let offset = input.len() - trimmed.len();
    if trimmed.len() >= 3 && trimmed[..3].eq_ignore_ascii_case("NOT") {
        let rest = &trimmed[3..];
        if rest.starts_with(char::is_whitespace) {
            let (rest, _) = multispace1(rest)?;
            let (rest, filter) = source_not(rest)?;
            return Ok((rest, SourceFilter::Not(Box::new(filter))));
        }
    }
    source_primary(&input[offset..])
}

fn source_and(input: &str) -> IResult<&str, SourceFilter> {
    let (mut rest, mut left) = source_not(input)?;
    loop {
        let trimmed = rest.trim_start();
        let _offset = rest.len() - trimmed.len();
        if trimmed.len() >= 3 && trimmed[..3].eq_ignore_ascii_case("AND") {
            let after = &trimmed[3..];
            if after.starts_with(char::is_whitespace) {
                let (after, _) = multispace1(after)?;
                let (after, right) = source_not(after)?;
                left = SourceFilter::And(Box::new(left), Box::new(right));
                rest = after;
                continue;
            }
        }
        break;
    }
    Ok((rest, left))
}

fn source_or(input: &str) -> IResult<&str, SourceFilter> {
    let (mut rest, mut left) = source_and(input)?;
    loop {
        let trimmed = rest.trim_start();
        let _offset = rest.len() - trimmed.len();
        if trimmed.len() >= 2 && trimmed[..2].eq_ignore_ascii_case("OR") {
            let after = &trimmed[2..];
            if after.starts_with(char::is_whitespace) {
                let (after, _) = multispace1(after)?;
                let (after, right) = source_and(after)?;
                left = SourceFilter::Or(Box::new(left), Box::new(right));
                rest = after;
                continue;
            }
        }
        break;
    }
    Ok((rest, left))
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

fn simple_expr(input: &str) -> IResult<&str, Expr> {
    alt((
        map(literal, Expr::Literal),
        // Call must precede field_ref: a non-keyword name like `length`
        // would otherwise parse as a field and leave the `(` unconsumed.
        call,
        paren_expr,
        map(field_ref, Expr::Field),
    ))(input)
}

fn where_expr(input: &str) -> IResult<&str, Expr> {
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

fn sort_direction(input: &str) -> IResult<&str, SortDirection> {
    alt((
        value(SortDirection::Desc, tag_no_case("DESC")),
        value(SortDirection::Asc, tag_no_case("ASC")),
    ))(input)
}

fn data_command(input: &str) -> IResult<&str, DataCommand> {
    alt((
        preceded(
            tuple((tag_no_case("WHERE"), multispace1)),
            map(where_expr, DataCommand::Where),
        ),
        preceded(
            tuple((tag_no_case("SORT"), multispace1)),
            map(
                tuple((field_ref, multispace0, opt(sort_direction))),
                |(field, _, dir)| DataCommand::Sort {
                    field,
                    direction: dir.unwrap_or(SortDirection::Asc),
                },
            ),
        ),
        preceded(
            tuple((
                tag_no_case("GROUP"),
                multispace1,
                tag_no_case("BY"),
                multispace1,
            )),
            map(pair(simple_expr, opt(alias_clause)), |(expr, alias)| {
                DataCommand::GroupBy { expr, alias }
            }),
        ),
        preceded(
            tuple((tag_no_case("FLATTEN"), multispace1)),
            map(pair(simple_expr, opt(alias_clause)), |(expr, alias)| {
                DataCommand::Flatten { expr, alias }
            }),
        ),
        preceded(
            tuple((tag_no_case("LIMIT"), multispace1)),
            map(digit1, |s: &str| DataCommand::Limit(s.parse().unwrap_or(0))),
        ),
    ))(input)
}

fn from_clause(input: &str) -> IResult<&str, SourceFilter> {
    preceded(tuple((tag_no_case("FROM"), multispace1)), source_or)(input)
}

fn query_plan(input: &str) -> IResult<&str, QueryPlan> {
    let (input, qt) = query_type(input)?;
    let (input, _) = multispace0(input)?;

    // For TABLE queries, parse comma-separated field list.
    // ident rejects keywords, so separated_list0 stops naturally at FROM/WHERE/SORT etc.
    let (input, fields) = if matches!(qt, QueryType::Table) {
        separated_list0(tuple((multispace0, char(','), multispace0)), query_field)(input)?
    } else {
        (input, vec![])
    };

    let (input, _) = multispace0(input)?;

    // Optional FROM
    let (input, from) = opt(from_clause)(input)?;
    let (input, _) = multispace0(input)?;

    // Zero or more data commands
    let (input, commands) = separated_list0(multispace1, data_command)(input)?;

    Ok((
        input,
        QueryPlan {
            query_type: qt,
            fields,
            from,
            commands,
        },
    ))
}

/// Parse a DQL query string into a QueryPlan.
pub fn parse_query(input: &str) -> Result<QueryPlan, ParseError> {
    let input = input.trim();
    match query_plan(input) {
        Ok(("", plan)) => Ok(plan),
        Ok((rest, _)) => Err(ParseError::Trailing(rest.to_string())),
        Err(e) => Err(ParseError::Syntax(e.to_string())),
    }
}
