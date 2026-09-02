use nom::{
    branch::alt,
    bytes::complete::{tag, tag_no_case, take_while1},
    character::complete::{char, digit1, multispace0, multispace1},
    combinator::{map, opt, value, verify},
    multi::{separated_list0, separated_list1},
    number::complete::double,
    sequence::{delimited, pair, preceded, tuple},
    IResult,
};

/// The type of query output.
#[derive(Debug, Clone, PartialEq)]
pub enum QueryType {
    Table,
    List,
    Task,
}

/// A field reference like `file.name` or `rating`.
#[derive(Debug, Clone, PartialEq)]
pub struct FieldRef(pub Vec<String>);

/// Sort direction.
#[derive(Debug, Clone, PartialEq)]
pub enum SortDirection {
    Asc,
    Desc,
}

/// A column in a TABLE query: `field AS "alias"`.
#[derive(Debug, Clone, PartialEq)]
pub struct QueryField {
    pub field: FieldRef,
    pub alias: Option<String>,
}

/// A data command in a query.
#[derive(Debug, Clone, PartialEq)]
pub enum DataCommand {
    Where(Expr),
    Sort {
        field: FieldRef,
        direction: SortDirection,
    },
    GroupBy(Expr),
    Flatten(Expr),
    Limit(u64),
}

/// A literal value.
#[derive(Debug, Clone, PartialEq)]
pub enum Literal {
    Text(String),
    Number(f64),
    Bool(bool),
    Null,
}

/// An expression in a WHERE clause.
#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Field(FieldRef),
    Literal(Literal),
    Comparison {
        left: Box<Expr>,
        op: CompareOp,
        right: Box<Expr>,
    },
    Not(Box<Expr>),
    Func {
        name: String,
        args: Vec<Expr>,
    },
}

/// Comparison operators.
#[derive(Debug, Clone, PartialEq)]
pub enum CompareOp {
    Eq,
    Ne,
    Lt,
    Gt,
    Le,
    Ge,
    Contains,
}

/// FROM source filter.
#[derive(Debug, Clone, PartialEq)]
pub enum SourceFilter {
    Tag(String),
    Folder(String),
    Link(String),
    And(Box<SourceFilter>, Box<SourceFilter>),
    Or(Box<SourceFilter>, Box<SourceFilter>),
    Not(Box<SourceFilter>),
}

/// A parsed DQL query plan.
#[derive(Debug, Clone, PartialEq)]
pub struct QueryPlan {
    pub query_type: QueryType,
    pub fields: Vec<QueryField>,
    pub from: Option<SourceFilter>,
    pub commands: Vec<DataCommand>,
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

const DQL_KEYWORDS: &[&str] = &[
    "from", "where", "sort", "limit", "group", "flatten", "asc", "desc",
    "as", "table", "list", "task", "and", "or", "not", "contains",
    "true", "false", "null",
];

fn is_keyword(s: &str) -> bool {
    DQL_KEYWORDS.contains(&s.to_ascii_lowercase().as_str())
}

/// An identifier: alphanumeric, underscore, hyphen. No dots — dots are field separators.
fn is_ident_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-'
}

fn ident(input: &str) -> IResult<&str, String> {
    map(
        verify(
            take_while1(is_ident_char),
            |s: &str| !is_keyword(s),
        ),
        |s: &str| s.to_string(),
    )(input)
}

fn field_ref(input: &str) -> IResult<&str, FieldRef> {
    map(
        separated_list1(char('.'), ident),
        FieldRef,
    )(input)
}
// Function-call names: alphanumeric + underscore, must start with a letter or
// underscore. Unlike `ident`, keywords are allowed — `contains` is a DQL
// keyword but a legal function name here.
fn fn_name(input: &str) -> IResult<&str, String> {
    map(
        verify(
            take_while1(|c: char| c.is_alphanumeric() || c == '_'),
            |s: &str| s.chars().next().map_or(false, |c| c.is_alphabetic() || c == '_'),
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
                separated_list0(
                    tuple((multispace0, char(','), multispace0)),
                    simple_expr,
                ),
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

fn query_field(input: &str) -> IResult<&str, QueryField> {
    let (input, field) = field_ref(input)?;
    let (input, alias) = opt(preceded(
        tuple((multispace1, tag_no_case("AS"), multispace1)),
        quoted_string,
    ))(input)?;
    Ok((input, QueryField { field, alias }))
}

fn source_tag(input: &str) -> IResult<&str, SourceFilter> {
    map(
        preceded(char('#'), take_while1(|c: char| c.is_alphanumeric() || c == '_' || c == '/' || c == '-')),
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
    let (input, _) = multispace0(input)?;
    match opt(compare_op)(input)? {
        (input, Some(op)) => {
            let (input, _) = multispace0(input)?;
            let (input, right) = simple_expr(input)?;
            Ok((input, Expr::Comparison {
                left: Box::new(left),
                op,
                right: Box::new(right),
            }))
        }
        (input, None) => Ok((input, left)),
    }
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
            tuple((tag_no_case("LIMIT"), multispace1)),
            map(digit1, |s: &str| DataCommand::Limit(s.parse().unwrap_or(0))),
        ),
    ))(input)
}

fn from_clause(input: &str) -> IResult<&str, SourceFilter> {
    preceded(
        tuple((tag_no_case("FROM"), multispace1)),
        source_or,
    )(input)
}

fn query_plan(input: &str) -> IResult<&str, QueryPlan> {
    let (input, qt) = query_type(input)?;
    let (input, _) = multispace0(input)?;

    // For TABLE queries, parse comma-separated field list.
    // ident rejects keywords, so separated_list0 stops naturally at FROM/WHERE/SORT etc.
    let (input, fields) = if matches!(qt, QueryType::Table) {
        separated_list0(
            tuple((multispace0, char(','), multispace0)),
            query_field,
        )(input)?
    } else {
        (input, vec![])
    };

    let (input, _) = multispace0(input)?;

    // Optional FROM
    let (input, from) = opt(from_clause)(input)?;
    let (input, _) = multispace0(input)?;

    // Zero or more data commands
    let (input, commands) = separated_list0(multispace1, data_command)(input)?;

    Ok((input, QueryPlan {
        query_type: qt,
        fields,
        from,
        commands,
    }))
}

/// Parse a DQL query string into a QueryPlan.
pub fn parse_query(input: &str) -> Result<QueryPlan, String> {
    let input = input.trim();
    match query_plan(input) {
        Ok(("", plan)) => Ok(plan),
        Ok((rest, _)) => Err(format!("Unexpected trailing text: {}", rest)),
        Err(e) => Err(format!("Parse error: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_table() {
        let plan = parse_query("TABLE").unwrap();
        assert_eq!(plan.query_type, QueryType::Table);
        assert!(plan.fields.is_empty());
        assert!(plan.from.is_none());
    }

    #[test]
    fn parse_table_with_fields() {
        let plan = parse_query("TABLE file.name, rating").unwrap();
        assert_eq!(plan.fields.len(), 2);
        assert_eq!(plan.fields[0].field.0, vec!["file", "name"]);
        assert_eq!(plan.fields[1].field.0, vec!["rating"]);
    }

    #[test]
    fn parse_table_with_alias() {
        let plan = parse_query(r#"TABLE file.name AS "Name", rating AS "Score""#).unwrap();
        assert_eq!(plan.fields[0].alias, Some("Name".to_string()));
        assert_eq!(plan.fields[1].alias, Some("Score".to_string()));
    }

    #[test]
    fn parse_from_tag() {
        let plan = parse_query("LIST FROM #project").unwrap();
        assert_eq!(plan.from, Some(SourceFilter::Tag("project".to_string())));
    }

    #[test]
    fn parse_from_folder() {
        let plan = parse_query(r#"TABLE FROM "notes""#).unwrap();
        assert_eq!(plan.from, Some(SourceFilter::Folder("notes".to_string())));
    }

    #[test]
    fn parse_from_link() {
        let plan = parse_query("LIST FROM [[MyNote]]").unwrap();
        assert_eq!(plan.from, Some(SourceFilter::Link("MyNote".to_string())));
    }

    #[test]
    fn parse_where_clause() {
        let plan = parse_query("TABLE FROM #tag WHERE rating > 7").unwrap();
        assert_eq!(plan.commands.len(), 1);
        match &plan.commands[0] {
            DataCommand::Where(Expr::Comparison { op, .. }) => {
                assert_eq!(*op, CompareOp::Gt);
            }
            _ => panic!("Expected comparison"),
        }
    }

    #[test]
    fn parse_sort() {
        let plan = parse_query("TABLE SORT file.name DESC").unwrap();
        assert_eq!(plan.commands.len(), 1);
        match &plan.commands[0] {
            DataCommand::Sort { field, direction } => {
                assert_eq!(field.0, vec!["file", "name"]);
                assert_eq!(*direction, SortDirection::Desc);
            }
            _ => panic!("Expected sort"),
        }
    }

    #[test]
    fn parse_limit() {
        let plan = parse_query("LIST LIMIT 10").unwrap();
        assert_eq!(plan.commands.len(), 1);
        assert_eq!(plan.commands[0], DataCommand::Limit(10));
    }

    #[test]
    fn parse_full_query() {
        let plan = parse_query(
            "TABLE file.name AS \"Title\", rating\nFROM #books\nWHERE rating > 5\nSORT rating DESC\nLIMIT 20",
        ).unwrap();
        assert_eq!(plan.query_type, QueryType::Table);
        assert_eq!(plan.fields.len(), 2);
        assert_eq!(plan.from, Some(SourceFilter::Tag("books".to_string())));
        assert_eq!(plan.commands.len(), 3);
    }

    #[test]
    fn parse_list_query() {
        let plan = parse_query("LIST FROM #todo").unwrap();
        assert_eq!(plan.query_type, QueryType::List);
    }

    #[test]
    fn parse_task_query() {
        let plan = parse_query("TASK FROM #project").unwrap();
        assert_eq!(plan.query_type, QueryType::Task);
    }

    #[test]
    fn parse_bad_syntax() {
        assert!(parse_query("BANANA").is_err());
    }

    #[test]
    fn parse_from_and() {
        let plan = parse_query("LIST FROM #work AND #urgent").unwrap();
        match plan.from.unwrap() {
            SourceFilter::And(a, b) => {
                assert_eq!(*a, SourceFilter::Tag("work".to_string()));
                assert_eq!(*b, SourceFilter::Tag("urgent".to_string()));
            }
            other => panic!("Expected And, got {:?}", other),
        }
    }

    #[test]
    fn parse_from_or() {
        let plan = parse_query("LIST FROM #work OR #personal").unwrap();
        match plan.from.unwrap() {
            SourceFilter::Or(a, b) => {
                assert_eq!(*a, SourceFilter::Tag("work".to_string()));
                assert_eq!(*b, SourceFilter::Tag("personal".to_string()));
            }
            other => panic!("Expected Or, got {:?}", other),
        }
    }

    #[test]
    fn parse_from_not() {
        let plan = parse_query("LIST FROM NOT #archive").unwrap();
        match plan.from.unwrap() {
            SourceFilter::Not(inner) => {
                assert_eq!(*inner, SourceFilter::Tag("archive".to_string()));
            }
            other => panic!("Expected Not, got {:?}", other),
        }
    }

    #[test]
    fn parse_from_parenthesized() {
        let plan = parse_query("LIST FROM (#work OR #personal) AND NOT #archive").unwrap();
        match plan.from.unwrap() {
            SourceFilter::And(left, right) => {
                assert!(matches!(*left, SourceFilter::Or(..)));
                assert!(matches!(*right, SourceFilter::Not(..)));
            }
            other => panic!("Expected And, got {:?}", other),
        }
    }

    #[test]
    fn parse_from_precedence_not_binds_tighter() {
        // NOT #a OR #b  should be  (NOT #a) OR #b
        let plan = parse_query("LIST FROM NOT #a OR #b").unwrap();
        match plan.from.unwrap() {
            SourceFilter::Or(left, right) => {
                assert!(matches!(*left, SourceFilter::Not(..)));
                assert_eq!(*right, SourceFilter::Tag("b".to_string()));
            }
            other => panic!("Expected Or, got {:?}", other),
        }
    }

    #[test]
    fn parse_from_and_with_folder() {
        let plan = parse_query(r#"TABLE FROM #work AND "notes""#).unwrap();
        match plan.from.unwrap() {
            SourceFilter::And(a, b) => {
                assert_eq!(*a, SourceFilter::Tag("work".to_string()));
                assert_eq!(*b, SourceFilter::Folder("notes".to_string()));
            }
            other => panic!("Expected And, got {:?}", other),
        }
    }
    #[test]
    fn parse_where_function_call() {
        let plan = parse_query(r#"TABLE file.name WHERE contains(file.name, "beta")"#).unwrap();
        assert_eq!(plan.commands.len(), 1);
        match &plan.commands[0] {
            DataCommand::Where(Expr::Func { name, args }) => {
                assert_eq!(name, "contains");
                assert_eq!(args.len(), 2);
                assert_eq!(args[0], Expr::Field(FieldRef(vec!["file".into(), "name".into()])));
                assert_eq!(args[1], Expr::Literal(Literal::Text("beta".into())));
            }
            other => panic!("Expected Func, got {:?}", other),
        }
    }

    #[test]
    fn parse_function_in_comparison() {
        let plan = parse_query("TABLE file.name WHERE length(tags) > 2").unwrap();
        match &plan.commands[0] {
            DataCommand::Where(Expr::Comparison { left, op, right }) => {
                assert_eq!(*op, CompareOp::Gt);
                assert!(matches!(left.as_ref(), Expr::Func { name, .. } if name == "length"));
                assert_eq!(right.as_ref(), &Expr::Literal(Literal::Number(2.0)));
            }
            other => panic!("Expected comparison, got {:?}", other),
        }
    }

    #[test]
    fn parse_nested_function_calls() {
        let plan = parse_query("TABLE file.name WHERE sum(length(rows.tags)) > 0").unwrap();
        match &plan.commands[0] {
            DataCommand::Where(Expr::Comparison { left, .. }) => {
                if let Expr::Func { name, args } = left.as_ref() {
                    assert_eq!(name, "sum");
                    assert_eq!(args.len(), 1);
                    if let Expr::Func { name: inner_name, args: inner_args } = &args[0] {
                        assert_eq!(inner_name, "length");
                        assert_eq!(inner_args[0], Expr::Field(FieldRef(vec!["rows".into(), "tags".into()])));
                    } else {
                        panic!("expected nested func");
                    }
                } else {
                    panic!("expected func");
                }
            }
            other => panic!("Expected comparison, got {:?}", other),
        }
    }

    #[test]
    fn parse_keyword_function_name() {
        // `contains` is a DQL keyword but must parse as a function call.
        let plan = parse_query(r#"TABLE file.name WHERE contains(file.name, "x")"#).unwrap();
        assert!(
            matches!(&plan.commands[0], DataCommand::Where(Expr::Func { name, .. }) if name == "contains"),
            "contains should parse as a function call"
        );
    }

    #[test]
    fn parse_paren_expr_grouping() {
        let plan = parse_query("TABLE file.name WHERE (rating > 5)").unwrap();
        match &plan.commands[0] {
            DataCommand::Where(Expr::Comparison { op, left, right }) => {
                assert_eq!(*op, CompareOp::Gt);
                assert_eq!(left.as_ref(), &Expr::Field(FieldRef(vec!["rating".into()])));
                assert_eq!(right.as_ref(), &Expr::Literal(Literal::Number(5.0)));
            }
            other => panic!("Expected comparison, got {:?}", other),
        }
    }

}
