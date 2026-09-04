/// The type of query output.
#[derive(Debug, Clone, PartialEq)]
pub enum QueryType {
    Table,
    List,
    Task,
}

/// Error produced while parsing a DQL query string.
#[derive(Debug, thiserror::Error, PartialEq)]
pub enum ParseError {
    /// Trailing text that could not be parsed after a valid query.
    #[error("Unexpected trailing text: {0}")]
    Trailing(String),
    /// The query could not be parsed.
    #[error("Parse error: {0}")]
    Syntax(String),
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

/// A column in a TABLE query: `expr AS "alias"`.
#[derive(Debug, Clone, PartialEq)]
pub struct QueryField {
    pub expr: Expr,
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
    GroupBy {
        expr: Expr,
        alias: Option<String>,
    },
    Flatten {
        expr: Expr,
        alias: Option<String>,
    },
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
