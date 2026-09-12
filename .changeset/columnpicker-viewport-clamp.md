---
"@fhir-place/react-fhir": patch
---

`<ColumnPicker>` panel no longer clips outside the viewport on narrow
screens. The panel is right-anchored to its trigger button; on mobile
(375px) the button can sit near the left edge of the screen, pushing
the panel's left edge off-screen by several pixels.

The fix measures the rendered panel's bounding rect via `useLayoutEffect`
and applies a `translateX` correction equal to the overshoot so the left
edge stays at least 8px inside the viewport. The panel also gains
`max-width: calc(100vw - 16px)` as a secondary safeguard.

Desktop layout is unchanged — when the panel is already in-bounds the
shift is 0 and no `style` prop is set.

Closes #656.
