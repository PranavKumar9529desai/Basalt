/**
 * Basalt architecture enforcement rules for Oxlint (ESLint-compatible API).
 *
 * Encodes the four-layer dependency model from AGENTS.md as machine-checked
 * rules instead of documentation-only conventions:
 *
 *  1. no-cross-feature-imports  features/X must not import features/Y,
 *     except type-only imports from Y/types.ts.
 *  2. no-upward-layer-imports   features/ must not import upward into
 *     shared/, app-shell/, or routes/.
 *  3. packages-no-tauri         packages/ primitives must never import
 *     @tauri-apps/* (ui/ stays backend-free).
 */

const SRC_FEATURES = "/apps/tauri/src/features/";
const FORBIDDEN_UPWARD = [
  "/apps/tauri/src/shared/",
  "/apps/tauri/src/app-shell/",
  "/apps/tauri/src/routes/",
];
const JS_EXT = /\.[cm]?[jt]sx?$/;

function toPosix(p) {
  return p.split("\\").join("/");
}

function featureOf(absPath) {
  const i = absPath.indexOf(SRC_FEATURES);
  if (i === -1) return null;
  const rest = absPath.slice(i + SRC_FEATURES.length);
  // Feature boundary is a slash OR end-of-path ("../tabs" barrel imports).
  const slash = rest.indexOf("/");
  return slash === -1 ? rest : rest.slice(0, slash);
}

function stripExtension(modulePath) {
  const withoutExt = modulePath.replace(JS_EXT, "");
  return withoutExt.replace(/\/index$/, "");
}

/** Resolve "./x/y" or "../../x/y" against the importing file's dir. */
function resolveRelative(specifier, importerAbsPath) {
  const segments = toPosix(importerAbsPath).split("/");
  segments.pop();
  for (const seg of specifier.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") {
      segments.pop();
    } else {
      segments.push(seg);
    }
  }
  return stripExtension(segments.join("/"));
}

function isTypeOnlyImport(node) {
  if (node.importKind === "type") return true;
  if (node.type === "ExportNamedDeclaration") return node.exportKind === "type";
  const specifiers = node.specifiers ?? [];
  return (
    specifiers.length > 0 &&
    specifiers.every(
      (s) => s.importKind === "type" || s.type === "ExportSpecifier",
    )
  );
}

function isTypesModuleOf(featureName, resolvedTarget) {
  return resolvedTarget.endsWith(`/features/${featureName}/types`);
}

const noCrossFeatureImports = {
  meta: { type: "problem" },
  create(context) {
    const file = toPosix(context.filename);
    const fromFeature = featureOf(file);
    if (!fromFeature) return {};

    const check = (node, sourceValue) => {
      if (typeof sourceValue !== "string" || !sourceValue.startsWith("."))
        return;
      const target = resolveRelative(sourceValue, file);
      const toFeature = featureOf(target);
      if (!toFeature || toFeature === fromFeature) return;
      if (isTypesModuleOf(toFeature, target) && isTypeOnlyImport(node)) return;
      context.report({
        node,
        message:
          `Cross-feature import: features/${fromFeature} -> features/${toFeature}. ` +
          `Wiring must go through shared/ or app-shell/. Only type-only imports ` +
          `from features/${toFeature}/types.ts are allowed.`,
      });
    };

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
    };
  },
};

const noUpwardLayerImports = {
  meta: { type: "problem" },
  create(context) {
    const file = toPosix(context.filename);
    if (!file.includes(SRC_FEATURES)) return {};

    const check = (node, sourceValue) => {
      if (typeof sourceValue !== "string" || !sourceValue.startsWith("."))
        return;
      const target = resolveRelative(sourceValue, file);
      const hit = FORBIDDEN_UPWARD.find(
        (layer) =>
          target.includes(layer) || target === layer.replace(/\/$/, ""),
      );
      if (!hit) return;
      const layerName = hit.split("/").filter(Boolean).pop();
      context.report({
        node,
        message: `Layer violation: features/ must not import ${layerName}/ (dependencies flow downward only).`,
      });
    };

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
    };
  },
};

const packagesNoTauri = {
  meta: { type: "problem" },
  create(context) {
    const file = toPosix(context.filename);
    const packagesIdx = file.indexOf("/packages/");
    if (packagesIdx === -1) return {};
    const withinPackages = file.slice(packagesIdx);

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== "string" || !source.startsWith("@tauri-apps"))
          return;
        // Generated theme tokens legitimately reference nothing Tauri; this
        // guards the whole packages/ tree regardless of subpackage.
        if (withinPackages.startsWith("/packages/theme/src/generated/")) return;
        context.report({
          node,
          message: `packages/ must not import "${source}" — primitives stay free of Tauri/business state (AGENTS.md layer table).`,
        });
      },
    };
  },
};

export default {
  meta: { name: "basalt" },
  rules: {
    "no-cross-feature-imports": noCrossFeatureImports,
    "no-upward-layer-imports": noUpwardLayerImports,
    "packages-no-tauri": packagesNoTauri,
  },
};
