import path from "path";

export function makeSwiftConfig(jsonFilePath, buildBase) {
  return {
    source: [jsonFilePath],
    platforms: {
      ios: {
        transformGroup: "ios-swift",
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
