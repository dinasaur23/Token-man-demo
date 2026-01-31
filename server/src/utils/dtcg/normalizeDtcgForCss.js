import { extractPrimitiveColor } from "./extractPrimitiveColor.js";

export function normalizeDtcgForCss(node, path = []) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    node.forEach((item, idx) =>
      normalizeDtcgForCss(item, path.concat(String(idx))),
    );
    return;
  }
  if ("$value" in node) {
    const before = node.$value;
    const primitive = extractPrimitiveColor(before);
    if (primitive && before !== primitive) {
      console.log(
        "normalizeDtcgForCss: converted",
        path.join("."),
        "from",
        JSON.stringify(before),
        "to",
        primitive,
      );
      node.$value = primitive;
    }
  }

  for (const [key, value] of Object.entries(node)) {
    normalizeDtcgForCss(value, path.concat(key));
  }
}
