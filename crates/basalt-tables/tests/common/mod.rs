use basalt_types::{QueryResult, TypedValue};

pub fn row_str(v: &TypedValue) -> String {
    match v {
        TypedValue::Text { value } => value.clone(),
        TypedValue::Number { value } => format!("{:?}", value),
        TypedValue::Checkbox { value } => format!("{}", value),
        TypedValue::Link { name, .. } => name.clone(),
        TypedValue::Null => "null".into(),
        TypedValue::Date { value } => value.clone(),
        TypedValue::DateTime { value } => value.clone(),
        TypedValue::List { items } => {
            let parts: Vec<String> = items.iter().map(row_str).collect();
            format!("[{}]", parts.join(", "))
        }
    }
}

pub fn print_result(_label: &str, dql: &str, result: &QueryResult) {
    let cols: Vec<&str> = result.columns.iter().map(|c| c.name.as_str()).collect();
    println!("  Q: {}", dql);
    println!("  cols: {:?}", cols);
    for row in &result.rows {
        let cells: Vec<String> = row.iter().map(row_str).collect();
        println!("  row: {:?}", cells);
    }
    println!("  total={}, shown={}", result.total, result.rows.len());
    println!();
}
