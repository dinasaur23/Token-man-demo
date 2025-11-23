export function extractPrimitiveColor(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;

  if (typeof value.hex === "string") return value.hex;

  if (typeof value.srgb === "string") return value.srgb;

  if (
    value.hex &&
    typeof value.hex === "object" &&
    typeof value.hex.$value === "string"
  ) {
    return value.hex.$value;
  }
  if (
    value.srgb &&
    typeof value.srgb === "object" &&
    typeof value.srgb.$value === "string"
  ) {
    return value.srgb.$value;
  }

  return null;
}
