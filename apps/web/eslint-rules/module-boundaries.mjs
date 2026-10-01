// ESLint rule `dcos/module-boundaries`: a file may reach into another business
// module only through that module's public API. The ownership map and the rule
// it encodes live in ../module-boundaries.mjs.

import path from "node:path";
import { CORE, isPublicApi, moduleOf } from "../module-boundaries.mjs";

function resolveImport(specifier, importerRel) {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return path.posix.join(path.posix.dirname(importerRel), specifier);
  }
  return null; // package import
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Restrict imports across business modules to each module's public API" },
    schema: [],
    messages: {
      internal:
        "'{{specifier}}' is internal to the {{target}} module and cannot be imported from {{source}}. " +
        "Add it to PUBLIC_API in module-boundaries.mjs, or move the shared code to core.",
    },
  },
  create(context) {
    const importerRel = path.relative(context.cwd, context.filename).replace(/\\/g, "/");
    if (importerRel.startsWith("..")) return {};
    const source = moduleOf(importerRel);

    function check(node, specifier) {
      if (typeof specifier !== "string") return;
      const targetRel = resolveImport(specifier, importerRel);
      if (!targetRel) return;
      const target = moduleOf(targetRel);
      if (target === CORE || target === source || isPublicApi(targetRel)) return;
      context.report({ node, messageId: "internal", data: { specifier, target, source } });
    }

    return {
      ImportDeclaration: (node) => check(node.source, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node.source, node.source.value),
      ExportAllDeclaration: (node) => check(node.source, node.source.value),
      ImportExpression: (node) => node.source.type === "Literal" && check(node.source, node.source.value),
      // Type-position `import("...")`.
      TSImportType: (node) => {
        const literal = node.argument?.literal ?? node.argument;
        if (literal?.type === "Literal") check(literal, literal.value);
      },
    };
  },
};

export default rule;
