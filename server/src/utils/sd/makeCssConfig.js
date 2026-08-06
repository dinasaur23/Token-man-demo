import path from "path";

/**
 * CSS variables export.
 *
 * Preparers already emit CSS-ready strings (`16px`, `150ms`, `cubic-bezier(...)`).
 * Keep the css transform group (includes cubicBezier/css + fontFamily/css as
 * safety nets) — stringified dimension/duration values pass through size/rem
 * unchanged.
 */
export function makeCssConfig(jsonFilePath, buildBase) {
  return {
    source: [jsonFilePath],
    platforms: {
      css: {
        transformGroup: "css",
        buildPath: path.join(buildBase, "css/"),
        files: [
          {
            destination: "tokens.css",
            format: "css/variables",
          },
        ],
      },
    },
  };
}
