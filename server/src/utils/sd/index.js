import { makeCssConfig } from "./makeCssConfig.js";
import { makeTailwindConfig } from "./makeTailwindConfig.js";
import { makeSwiftConfig } from "./makeSwiftConfig.js";
import { makeAndroidConfig } from "./makeAndroidConfig.js";

export function createSdConfig(format, jsonFilePath, buildBase) {
  switch (format) {
    case "css":
      return makeCssConfig(jsonFilePath, buildBase);
    case "tailwind":
      return makeTailwindConfig(jsonFilePath, buildBase);
    case "swift":
      return makeSwiftConfig(jsonFilePath, buildBase);
    case "android":
      return makeAndroidConfig(jsonFilePath, buildBase);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
