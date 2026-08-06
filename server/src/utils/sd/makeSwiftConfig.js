import path from "path";

export function makeSwiftConfig(jsonFilePath, buildBase) {
  return {
    source: [jsonFilePath],
    platforms: {
      ios: {
        transformGroup: "token-manager/ios-swift",
        // SD historical default for rem→pt/CGFloat; override via platform when remBasePx is productized.
        basePxFontSize: 16,
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
