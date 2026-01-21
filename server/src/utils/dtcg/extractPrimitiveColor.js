function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
function to255(n) {
  return Math.round(clamp01(n) * 255);
}
function toHex2(n) {
  return to255(n).toString(16).padStart(2, "0");
}

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

  if (
    value.colorSpace === "srgb" &&
    Array.isArray(value.components) &&
    (value.components.length === 3 || value.components.length === 4) &&
    value.components.every((c) => typeof c === "number")
  ) {
    const [r, g, b] = value.components;
    return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  }

  return null;
}
