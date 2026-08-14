# Exporting

Use **Export tokens** in the web app (disabled until the workspace has at least one token). The dialog copy is: *Exports all token sets in this workspace.*

Pick one or more formats, then **Download**. Each format is a separate ZIP.

## Canonical DTCG JSON

UI label: **JSON (canonical DTCG source)** (`format=json`).

This export serializes **source** documents:

- aliases stay as authored (`{spacing.sm}` is not replaced with `8px`)
- group hierarchy, `$description`, `$deprecated`, and `$extensions` are kept
- group `$type` stays on groups; it is not copied onto leaves that omitted it
- values are not flattened for a platform

Use this file to round-trip or share DTCG with another tool. It is **not** passed through Style Dictionary.

From the server export tests, a source alias is preserved:

```json
{
  "spacing": {
    "$type": "dimension",
    "sm": { "$value": { "value": 8, "unit": "px" } },
    "aliasSm": { "$value": "{spacing.sm}" }
  }
}
```

ZIP entry: `tokens.dtcg.json`.

## Platform export

These formats use **resolved** tokens (aliases followed) and Style Dictionary.

| UI label | `format` | ZIP payload |
| --- | --- | --- |
| CSS variables | `css` | `tokens.css` |
| Tailwind config | `tailwind` | `tailwind.tokens.js` |
| Swift (iOS) | `swift` | `Tokens.swift` |
| Android | `android` | `colors/tokens.xml` |

SCSS exists inside the Style Dictionary helper but is **not** a ZIP/UI option.

### CSS (from current serializers and export tests)

Custom properties. Values below match `serializeDimensionCss` / `serializeDurationCss` / `serializeCubicBezierCss` and the CSS pipeline tests.

Dimension `{ "value": 16, "unit": "px" }`:

```css
--spacing-md: 16px;
```

Dimension `{ "value": 8, "unit": "px" }`:

```css
--spacing-sm: 8px;
```

Duration `{ "value": 150, "unit": "ms" }`:

```css
--motion-duration-fast: 150ms;
```

Duration `{ "value": 0.25, "unit": "s" }` keeps seconds (no conversion to `ms`):

```css
--motion-duration-fade: 0.25s;
```

Cubic Bézier `[0.4, 0, 0.2, 1]`:

```css
--motion-easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
```

Aliases are resolved in platform CSS (test fixture `--spacing-alias-sm: 8px;`).

### Tailwind

JavaScript module (`javascript/module`). Serialized values are the same CSS-like strings (tests assert `8px` and `150ms` in the file).

### Swift

Class file (`ios-swift/class.swift`). From serializers and tests:

- dimension `8px` → `CGFloat(8)`
- duration `150ms` → `"150ms"`
- cubic Bézier → `"cubic-bezier(0.4, 0, 0.2, 1)"`

### Android

Resources XML. Dimension `px` is emitted as `dp` 1:1 (`8px` → `8dp`). Duration stays a string such as `150ms`. Cubic Bézier stays the CSS `cubic-bezier(...)` string.

#### `rem` on Android

If any dimension uses `unit: "rem"`, the dialog field **Android rem base (px)** must be a positive number. The server does **not** assume 16.

- Missing or `<= 0` → error `EXPORT_REM_BASE_REQUIRED` (export fails).
- Success → warning `EXPORT_LOSSY_REM` (`Nrem` × `remBasePx` → `dp`).

`px` tokens are not rem-converted.

## Reports, warnings, and errors

Platform export collects structured issues `{ path, code, message, severity }`.

- Hard failure (including Style Dictionary / guard failures): HTTP 400 JSON `{ ok: false, errors, warnings, message }`.
- Success with warnings: ZIP includes **`export-report.json`**: `{ ok: true, warnings, errors: [] }`.

Guards refuse leftover objects (`EXPORT_RAW_OBJECT_VALUE`) and `[object Object]` strings (`EXPORT_OBJECT_STRINGIFIED`).

Other codes you may see: `EXPORT_LOSSY_COLOR`, `EXPORT_LOSSY_REM`, `EXPORT_REM_BASE_REQUIRED`, `EXPORT_UNSUPPORTED_*` per type, `EXPORT_EMPTY_RESOLVED`, `EXPORT_EMPTY_SOURCE`.
