# User guide

This guide is for using the Token Manager web app after you [run it locally](getting-started.md) or open a deployed instance.

## Design Systems

A **Design System** is your workspace: a named container that belongs to your account. Tokens are stored per Design System, not globally.

After login you land on **Welcome** (`/StartPage`):

1. Type a name in **Enter the name of your design**.
2. Press Enter:
   - if the name already exists, that Design System opens;
   - if it is new, Token Manager creates it, then opens it.
3. Or click a chip under **Design Systems**.

The app then opens the **Color** page (`/tokens/color`).

On the Start page, each Design System’s overflow menu has **Rename** and **Delete**. Delete confirms: all tokens in that Design System are removed.

You can switch Design Systems later from the navbar autocomplete. The current selection is remembered in the browser (`tm-current-design-system`).

## Token sets

A **token set** is one source DTCG JSON document inside a Design System.

```text
Design System          ← workspace (your project)
└── Token Set          ← one DTCG JSON file (source document)
    ├── groups
    └── tokens
```

One Design System can hold **several** token sets. The table always shows the **active** token set. Platform export still includes **all** token sets in the workspace.

### Create an empty set

1. Click **New token set**.
2. Enter a **Token set name**.
3. Preview shows `File: {name}.json` (`.json` is appended if you omit it).
4. Click **Create**.

That creates an empty source document `{}`. Empty files cannot be imported; they must be created this way.

The token-set name **is** the JSON filename (workspace key), for example `Brand.json`.

### Import JSON

Import is available when the Design System has **no token sets yet** (empty-state **DTCG JSON file** picker).

- Choose one or more `.json` files.
- Each file becomes a token set named after the original filename.
- The first file becomes the active token set.
- Files must be valid DTCG for this app (see [DTCG Import](dtcg-import.md)).

Sample files: [`examples/`](../examples/README.md).

### Switch token sets

If there is one set, its filename appears as a chip labeled **Active token set**. If there are several, use the dropdown to switch.

Switching shows only that file’s groups and tokens. Resolution does not mix files.

### Empty set vs empty type page

- **Empty token set** — the active file has no tokens yet. Use **New group**, then **New token**.
- **No {type} tokens** — this page’s type has no tokens in the active set; other types may exist. Switch pages in the **Category** drawer, or create a token on this page.

## Groups

Groups are nested objects in the DTCG JSON (everything that is not a token leaf).

Once a token set exists:

| Action | Where | What it does |
| --- | --- | --- |
| **New group** | Toolbar | Creates a **root** group. Dialog title **Add group**, parent `— root —`. |
| **Child group** | Toolbar (needs a selected group) or tree **Add child group** | Creates a nested group under the selected/target group. |
| **Rename group** | Tree menu or double-click the title | Display name only (JSON keys stay the same). |
| **Delete group** | Tree menu | Deletes the group and all tokens inside it. |

New groups get `$type` equal to the **current page** (Color page → color group, and so on). They start empty — no token is created automatically.

The group tree is **type-scoped**:

- groups that contain tokens of the current page type are shown;
- empty groups whose group `$type` matches the page are shown;
- other-type groups are hidden on that page.

A mixed group (color and dimension tokens together) appears on both Color and Dimension pages.

## Creating and editing tokens

The left **Category** drawer picks the token type for this page:

| Nav label | URL | Tokens created on this page |
| --- | --- | --- |
| Color | `/tokens/color` | Color |
| Dimension | `/tokens/dimension` | Dimension |
| Number | `/tokens/number` | Number |
| Duration | `/tokens/duration` | Duration |
| Font Family | `/tokens/fontFamily` | Font Family |
| Font Weight | `/tokens/fontWeight` | Font Weight |
| Cubic Bézier | `/tokens/cubicBezier` | Cubic Bézier |

```text
Color page      → creates a Color token
Dimension page  → creates a Dimension token
```

### New token

1. Select a group (required; otherwise **New token** is disabled: *Select a group first*).
2. Click **New token**.

No name dialog opens. The token is inserted immediately with a default name (`new-token`, then `new-token-copy`, …) and the default `$value` for the current page type. If a table row in that group is selected, the new token is inserted below it.

### Table row menu (⋮)

| Item | Behavior |
| --- | --- |
| **Duplicate row** | Copies the value; new key `name-copy`, `name-copy-2`, … |
| **Add row below** | New token of the **clicked row’s** type (not necessarily the page type) |
| **Create alias** / **Change alias** | Point this token at another same-type token |
| **Remove alias** | Restore a concrete value |
| **Delete row** | Removes the token; confirms if other tokens reference it |

### Inline edit

Columns: **Name**, **Value**, **Alias path**, and actions. Color pages also have **Hex** and **Color**.

- **Name** in the table is a display override. It does not rename the JSON key.
- Aliased tokens are not value-editable until you remove the alias.
- Invalid value input reverts.

Typical editor input:

| Type | Example input |
| --- | --- |
| Color | hex (`#3079B0`) or `srgb(...)` |
| Dimension | `16px` or `1rem` |
| Duration | `200ms` or `0.3s` |
| Cubic Bézier | `cubic-bezier(0.4, 0, 0.2, 1)` or four numbers |

Default `$value` for a new token:

| Type | Default |
| --- | --- |
| color | sRGB black (`#000000`) |
| dimension | `{ "value": 0, "unit": "px" }` |
| number | `0` |
| duration | `{ "value": 0, "unit": "ms" }` |
| fontFamily | `"sans-serif"` |
| fontWeight | `400` |
| cubicBezier | `[0.25, 0.1, 0.25, 1]` (CSS `ease`) |

## Token types (JSON shapes)

These are the `$value` shapes the app validates. Import and export use the same shapes.

### Color

```json
{
  "$type": "color",
  "$value": {
    "colorSpace": "srgb",
    "components": [0.2, 0.4, 1],
    "alpha": 1
  }
}
```

Canonical objects use a `colorSpace` plus `components`. Optional `alpha` is in `[0, 1]`. Optional `hex` must be 6-digit `#RRGGBB`. Hex **strings** as `$value` (for example `"#3079B0"`) are accepted as compatibility input and normalized to objects on import.

### Dimension

```json
{
  "$type": "dimension",
  "$value": {
    "value": 16,
    "unit": "px"
  }
}
```

`unit` must be `"px"` or `"rem"` (required even when `value` is `0`). Strings like `"16px"` are not valid source JSON.

### Number

```json
{
  "$type": "number",
  "$value": 0.8
}
```

A finite JSON number (not a string).

### Duration

```json
{
  "$type": "duration",
  "$value": {
    "value": 0.25,
    "unit": "s"
  }
}
```

`unit` must be `"ms"` or `"s"`. Strings like `"200ms"` are not valid source JSON.

### Font Family

```json
{
  "$type": "fontFamily",
  "$value": "Inter"
}
```

A non-empty string, or a non-empty array of names: `["Inter", "sans-serif"]`.

### Font Weight

```json
{
  "$type": "fontWeight",
  "$value": 700
}
```

A number in `[1, 1000]`, or an exact-case name such as `"bold"` or `"semi-bold"` (not `"Bold"`).

### Cubic Bézier

```json
{
  "$type": "cubicBezier",
  "$value": [0.4, 0, 0.2, 1]
}
```

Four numbers `[P1x, P1y, P2x, P2y]`. `P1x` and `P2x` must be in `[0, 1]`.

## Aliases

Use a curly-brace string as `$value`:

```json
{
  "$type": "color",
  "$value": "{color.primary}"
}
```

In the table: **Create alias**, pick a same-type target. See [DTCG Import](dtcg-import.md) for `$root` and JSON Pointer `$ref`.

## Export

Click **Export tokens** (enabled once at least one token exists). That exports **all** token sets in the Design System. See [Exporting](exporting.md).

## Figma

Click **Import from Figma** for a short in-app reminder, then follow [Figma Plugin](figma-plugin.md).
