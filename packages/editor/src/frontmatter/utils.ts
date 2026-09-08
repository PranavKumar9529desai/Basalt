import type { FrontmatterValue } from "./types";

export type FrontmatterType = FrontmatterValue["type"];

/** True when the value is an explicit null / empty (`{ type: "null" }`). */
export function isNullValue(v: FrontmatterValue): boolean {
  return v.type === "null";
}

/** The interned discriminator of a value ("text" | "number" | …). */
export function valueType(v: FrontmatterValue): FrontmatterType {
  return v.type;
}

/** Structural equality for two `FrontmatterValue`s (avoids JSON.stringify). */
export function frontmatterValuesEqual(
  a: FrontmatterValue,
  b: FrontmatterValue,
): boolean {
  switch (a.type) {
    case "null":
      return b.type === "null";
    case "text":
    case "number":
    case "date":
    case "datetime":
    case "checkbox":
      return a.type === b.type && a.value === b.value;
    case "link":
      return b.type === "link" && a.name === b.name && a.path === b.path;
    case "list":
      return (
        b.type === "list" &&
        a.items.length === b.items.length &&
        a.items.every((item, i) => frontmatterValuesEqual(item, b.items[i]))
      );
  }
}
