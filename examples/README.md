# Examples

Importable DTCG JSON for Token Manager. Each file is a **token set** (one source document).

## How to import

1. Log in and open (or create) a Design System.
2. If the workspace already has token sets, import is hidden — use a new Design System, or only create sets with **New token set**.
3. In the empty state, choose **DTCG JSON file** and pick one of the files below.

See [DTCG Import](../docs/dtcg-import.md) and the [User Guide](../docs/user-guide.md).

## Files

| File | What it demonstrates |
| --- | --- |
| [`all-basic-types.json`](all-basic-types.json) | All seven supported basic types in one document, with group `$type` inheritance. |
| [`aliases.json`](aliases.json) | Curly-brace aliases, including a group `$root` token and inherited group `$type`. |
| [`color-theme.json`](color-theme.json) | A small practical palette plus semantic color aliases. |
| [`figma-like-tokens.json`](figma-like-tokens.json) | All seven types in the nested shape Figma sync produces (collection + slash paths), including `$extensions.figma`. |

These files are meant to pass the same import validation the app uses (`validateTokensStrict`).
