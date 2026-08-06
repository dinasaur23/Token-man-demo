import path from "path";

/**
 * Android resources export.
 *
 * Preparers emit final dimen/string literals (`16dp`, `8px`, `150ms`).
 * Omit `size/remToDp` / `size/remToSp` — those assume unitless rem and would
 * turn `16px` into `256.00dp` or leave `{value,unit}` as `[object Object]`.
 */
export function makeAndroidConfig(jsonFilePath, buildBase) {
  return {
    source: [jsonFilePath],
    platforms: {
      android: {
        transforms: ["attribute/cti", "name/snake", "color/hex8android"],
        buildPath: path.join(buildBase, "android/"),
        files: [
          {
            destination: "colors/tokens.xml",
            format: "android/resources",
          },
        ],
      },
    },
  };
}
