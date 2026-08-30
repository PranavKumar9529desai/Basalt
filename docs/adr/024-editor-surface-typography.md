# ADR-024: Editor Surface Typography and Spatial Rhythm

**Status:** Accepted (2026-08-30)
**Date:** 2026-08-30
**Extends:** ADR-011 (prose typography system), ADR-022 (frontmatter Properties widget), ADR-023 (inline note title)

## Context

Basalt's editor now has three visible layers at the top of a note:

1. The inline filename title.
2. The `Properties` section label and property rows.
3. Markdown body content.

These layers are visually related but have different semantic roles. The
title is document identity, `Properties` is editor UI, and property values are
editable metadata. Styling them with inherited typography and isolated pixel
values makes the editor difficult to tune consistently across themes and
causes small spacing changes to drift from the Obsidian-like reference.

Obsidian's visual consistency comes from semantic roles and theme variables
for text, surfaces, borders, hover states, focus states, and control sizes.
Basalt already has the `--sat-*` token system, but the editor surface lacks a
dedicated contract for these relationships.

## Decision

Basalt will treat the note editor surface as a tokenized typography and
spacing system. Components may choose their semantic role, but must not invent
one-off typography or color values when a token exists.

### Semantic roles

The editor defines these visual roles:

| Role | Responsibility |
| --- | --- |
| Note title | Filename identity and rename surface; strongest editor heading |
| Section label | UI label such as `Properties`; distinct from body text, subordinate to the title |
| Property key | Metadata name; muted relative to its value |
| Property value | Editable metadata; primary editor text |
| Empty value | Explicitly empty metadata; readable but faint |
| Editor control | Inputs, chips, checkboxes, suggestions, and focus states |
| Body prose | Markdown content and normal paragraph rhythm |

### Token ownership

Editor-specific typography and spatial values belong in the `--sat-editor-*`
token family. At minimum, the system provides tokens for:

- prose font family, size, and line height;
- title size, weight, line height, and letter spacing;
- section-label size, weight, and color;
- property key/value/empty colors;
- property icon size and color;
- property key column width and row height;
- title-to-properties, label-to-row, row-to-row, and properties-to-body gaps;
- editor readable width, control radius, hover surface, border, and focus ring.

Fallbacks may be supplied at the use site for an incomplete theme, but the
fallback remains an implementation safety net, not the design contract.

### Spatial relationships

The top-of-note layout follows this rhythm:

```text
note title
    title-to-properties gap     (largest)
Properties
    label-to-row gap             (small)
property rows
    row rhythm                   (consistent)
body content
```

The title and Properties block remain in the same readable-width container.
The Properties label stays close to its rows and receives more separation from
the title. The property grid keeps a stable value start column regardless of
the key text length.

### Interaction styling

Property rows expose one full-row hover and focus surface. Individual inputs
remain visually transparent until focused, so the row—not a collection of
browser-default fields—forms the interaction boundary. Mouse hover and
keyboard focus must use the same semantic hover, border, and focus tokens.

The `+ Add property` action is the default collapsed state. Key/value inputs
appear only after the action is activated, preserving the editing behavior
while keeping the Properties section visually quiet.

### Boundaries

- ADR-011 owns the general prose font and heading scale.
- ADR-023 owns the inline title's rename behavior and lifecycle.
- ADR-022 owns frontmatter parsing, typed values, surgical edits, and the
  Properties widget architecture.
- This ADR owns the visual roles, typography tokens, and spatial relationships
  shared by those surfaces.

No editor surface may bypass these boundaries by adding a second typography
system or a component-local color palette.

## Consequences

- Themes can tune the editor's visual rhythm without editing widget code.
- The title, Properties section, and body remain visually coherent across
  light, dark, and custom themes.
- Property UI can match Obsidian's hierarchy without making the label look like
  another body line or making rows look like an unrelated card.
- Existing hardcoded editor values must be migrated incrementally to tokens;
  this is intentionally a follow-up implementation task, not a reason to
  duplicate tokens in individual components.
- Visual changes should be reviewed at narrow and wide pane sizes because the
  readable-width and property-column tokens interact with responsive layout.

## Validation

The editor surface is considered compliant when:

- the title-to-Properties gap is visibly larger than the label-to-row gap;
- property keys are visually quieter than values;
- values begin from a stable column across all standard property keys;
- hover and keyboard focus reveal the complete property row;
- no editor typography or color regression requires a component-local magic
  value;
- the same layout remains usable in every shipped theme.
