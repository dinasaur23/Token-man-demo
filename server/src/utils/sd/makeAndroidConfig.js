import path from "path";

export function makeAndroidConfig(jsonFilePath, buildBase) {
  return {
    source: [jsonFilePath],
    platforms: {
      android: {
        transformGroup: "android",
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
