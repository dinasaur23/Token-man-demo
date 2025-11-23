import path from "path";

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
