import path from "path";

/**
 * Swift / iOS export.
 *
 * Preparers emit:
 * - dimension → unitless point numbers
 * - duration → seconds (numbers)
 * - cubicBezier / fontFamily → Swift string literals (quotes embedded)
 * - color → hex (color/UIColorSwift)
 *
 * Omit `size/swift/remToCGFloat` — it assumes rem and multiplies by 16,
 * which corrupted pre-serialized values (16px → CGFloat(256)).
 */
export function makeSwiftConfig(jsonFilePath, buildBase) {
  return {
    source: [jsonFilePath],
    platforms: {
      ios: {
        transforms: [
          "attribute/cti",
          "name/camel",
          "color/UIColorSwift",
          "content/swift/literal",
          "asset/swift/literal",
        ],
        buildPath: path.join(buildBase, "ios/"),
        files: [
          {
            destination: "Tokens.swift",
            format: "ios-swift/class.swift",
            options: {
              className: "Tokens",
            },
          },
        ],
      },
    },
  };
}
