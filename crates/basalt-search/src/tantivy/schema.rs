use tantivy::schema::{IndexRecordOption, Schema, TextFieldIndexing, TextOptions, STORED, STRING};

pub fn build_schema() -> (
    Schema,
    tantivy::schema::Field,
    tantivy::schema::Field,
    tantivy::schema::Field,
    tantivy::schema::Field,
) {
    let mut builder = Schema::builder();

    let stored_text = TextOptions::default()
        .set_indexing_options(
            TextFieldIndexing::default()
                .set_tokenizer("en_stem")
                .set_index_option(IndexRecordOption::WithFreqsAndPositions),
        )
        .set_stored();

    // STRING = indexed as a single raw token (no stemming) + stored; enables exact-match deletion
    let path_field = builder.add_text_field("path", STRING | STORED);
    let title_field = builder.add_text_field("title", stored_text.clone());
    let body_field = builder.add_text_field("body", stored_text.clone());
    // Tags keep their identity: whitespace-split, NO stemming or punctuation
    // splitting (`project/2026` is ONE token, `ideas` stays `ideas`) — the
    // `tag:` operator must match the tag as written, not a stemmed variant.
    let tag_text = TextOptions::default()
        .set_indexing_options(
            TextFieldIndexing::default()
                .set_tokenizer("basalt_tag")
                .set_index_option(IndexRecordOption::WithFreqsAndPositions),
        )
        .set_stored();
    let tags_field = builder.add_text_field("tags", tag_text);
    (
        builder.build(),
        path_field,
        title_field,
        body_field,
        tags_field,
    )
}
