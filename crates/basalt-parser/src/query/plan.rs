use nom::{
    branch::alt,
    bytes::complete::tag_no_case,
    character::complete::{char, digit1, multispace0, multispace1},
    combinator::{map, opt, value},
    multi::separated_list0,
    sequence::{pair, preceded, tuple},
    IResult,
};
use super::ast::*;
use super::expr::{field_ref, quoted_string, simple_expr, where_expr};
use super::source::from_clause;

// ---------------------------------------------------------------------------
// Query planning
// ---------------------------------------------------------------------------

fn query_type(input: &str) -> IResult<&str, QueryType> {
    alt((
        value(QueryType::Table, tag_no_case("TABLE")),
        value(QueryType::List, tag_no_case("LIST")),
        value(QueryType::Task, tag_no_case("TASK")),
    ))(input)
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