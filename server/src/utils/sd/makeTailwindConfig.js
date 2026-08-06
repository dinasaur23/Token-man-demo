import path from "path";

/**
 * Tailwind / JS module export.
 *
 * Preparers emit CSS-like strings for dimensions/durations/font stacks.
 * Omit `size/rem` so numeric slip-throughs are not rewritten as `Nrem`.
 */
export function makeTailwindConfig(jsonFilePath, buildBase) {
  return {
    source: [jsonFilePath],
    platforms: {
      tailwind: {
        transforms: ["attribute/cti", "name/pascal", "color/hex"],
        buildPath: path.join(buildBase, "tailwind/"),
        files: [
          {
            destination: "tailwind.tokens.js",
            format: "javascript/module",
            options: {
              outputReferences: false,
              showFileHeader: true,
            },
          },
        ],
      },
    },
  };
}
