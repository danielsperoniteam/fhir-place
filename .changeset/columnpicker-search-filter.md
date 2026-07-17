---
"@fhir-place/react-fhir": minor
---

`<ColumnPicker>` gains a built-in search/filter input. When the picker has
more than 10 options the panel renders a "Filter columns…" text input at
the top; typing narrows the option list by case-insensitive substring
against `label` and `path`. ArrowDown from the input jumps focus into the
checkbox list, Esc still closes, and the filter resets on close so the
next open starts clean. Two new optional props:

- `searchable?: boolean` — force-enable or force-disable the input.
  Defaults to `options.length > 10`.
- `searchPlaceholder?: string` — override the placeholder text (default:
  "Filter columns…").

Toggling a checkbox while the filter is active preserves prior selections
that fall outside the current filter — i.e. you can search for "marital",
check the matching box, clear the filter, and the previously-checked
columns are still there.

Closes #238.
