---
name: frontend-store-selectors
---

# Store selectors return raw state; derive in useMemo

- A zustand / `useSyncExternalStore` selector (`useViewStore`, any `create<…>()` store hook in `frontend/src/stores/` or `frontend/src/scene/`) MUST return raw, referentially-stable state. Never build a fresh reference inside the selector — no normalization, map, filter, or object/array literal that mints a new reference per call.
- Derive OUTSIDE the selector, in a `useMemo` keyed on the raw slice: `const raw = useStore(s => s.openDocs); return useMemo(() => normalize(raw), [raw]);`.
- `useShallow` does NOT lift this: it compares one level deep, so a selector that freshly derives a NESTED object/array still changes identity every snapshot. Select each raw field separately and assemble the derived view in `useMemo`.
- A fresh reference makes `getSnapshot` return a new value each render → "The result of getSnapshot should be cached" → "Maximum update depth exceeded" → the surface crashes behind its `ErrorBoundary`.
- Primitive-returning selectors (`s.openDocs.length > 0`, a string, a boolean) are fine — primitives are value-compared.
