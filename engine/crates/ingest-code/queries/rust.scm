; Rust import surface (codebase-graphing ADR D2).
;
; `use` declarations: capture the whole argument subtree's text; the resolver
; parses the path text (handles `crate::`, `super::`, `self::`, grouped
; `{a, b}` imports, `as` renames, and leading `::`).
(use_declaration
  argument: (_) @import.use)

; Out-of-line module declarations: `mod x;` (no body). An inline `mod x { .. }`
; declares no file relationship, so the body field is negated.
(mod_item
  name: (identifier) @import.mod
  !body)

; Path attribute form: `#[path = "other.rs"] mod x;` is rare and resolved as a
; plain sibling `mod` in v1 (the attribute is not inspected).
