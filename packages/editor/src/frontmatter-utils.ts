import type { FrontmatterValue } from "./types";

export type FrontmatterVariant = Exclude<FrontmatterValue, "None">;

export function isFrontmatterObject(v: FrontmatterValue): v is FrontmatterVariant {
  return typeof v !== "string";
}

export function getVariantKey(
  v: FrontmatterVariant,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const key of Object.keys(v)) {
    if (key.toLowerCase() === lower) return key;
  }
  return undefined;
}

/** Structural equality for two `FrontmatterValue`s (avoids JSON.stringify). */
export function frontmatterValuesEqual(
  a: FrontmatterValue,
  b: FrontmatterValue,
): boolean {
  if (a === "None" || b === "None") return a === b;
  if (typeof a === "string" || typeof b === "string") return a === b;

  const aEntry = Object.entries(a)[0];
  const bEntry = Object.entries(b)[0];
  if (!aEntry || !bEntry) return aEntry === bEntry;
  const [aKey, av] = aEntry;
  const [bKey, bv] = bEntry;
  if (aKey !== bKey) return false;

  if (Array.isArray(av) && Array.isArray(bv)) {
    if (av.length !== bv.length) return false;
    return av.every((item, i) =>
      frontmatterValuesEqual(
        item as FrontmatterValue,
        bv[i] as FrontmatterValue,
      ),
    );
  }
  if (Array.isArray(av) || Array.isArray(bv)) return false;
  return av === bv;
}
