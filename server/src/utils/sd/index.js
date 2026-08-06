import path from "path";
import { makeCssConfig } from "./makeCssConfig.js";
import { makeTailwindConfig } from "./makeTailwindConfig.js";
import { makeSwiftConfig } from "./makeSwiftConfig.js";
import { makeAndroidConfig } from "./makeAndroidConfig.js";
import { withDtcgSdAdapters } from "./dtcgTransforms.js";
import { ensureDtcgTransformsRegistered } from "./registerDtcgTransforms.js";

export function createSdConfig(format, jsonFilePath, buildBase) {
  ensureDtcgTransformsRegistered();

  let config;
  switch (format) {
    case "css":
      config = makeCssConfig(jsonFilePath, buildBase);
      break;
    case "scss":
      // SCSS is not a first-class ZIP export yet; adapters are ready when wired.
      config = {
        source: [jsonFilePath],
        platforms: {
          scss: {
            transformGroup: "token-manager/scss",
            buildPath: path.join(buildBase, "scss/"),
            files: [
              {
                destination: "tokens.scss",
                format: "scss/variables",
              },
            ],
          },
        },
      };
      break;
    case "tailwind":
      config = makeTailwindConfig(jsonFilePath, buildBase);
      break;
    case "swift":
      config = makeSwiftConfig(jsonFilePath, buildBase);
      break;
    case "android":
      config = makeAndroidConfig(jsonFilePath, buildBase);
      break;
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
  return withDtcgSdAdapters(config);
}

export { withDtcgSdAdapters } from "./dtcgTransforms.js";
export { assertNoRawObjectExportValues } from "./exportGuard.js";
export { buildPlatformWithDtcgGuards } from "./buildPlatformWithDtcgGuards.js";
export { runStyleDictionaryExport } from "./runStyleDictionaryExport.js";
export { ensureDtcgTransformsRegistered } from "./registerDtcgTransforms.js";
