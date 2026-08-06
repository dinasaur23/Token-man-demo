import path from "path";

export function makeTailwindConfig(jsonFilePath, buildBase) {
  return {
    source: [jsonFilePath],
    platforms: {
      tailwind: {
        transformGroup: "token-manager/tailwind",
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
