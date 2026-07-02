; TypeScript / TSX / JavaScript import surface (codebase-graphing ADR D2).
; The three grammars share this node vocabulary.

; import ... from "spec"  (also bare `import "spec"`)
(import_statement
  source: (string (string_fragment) @import.source))

; export ... from "spec"  (re-export edges are real dependencies)
(export_statement
  source: (string (string_fragment) @import.source))

; require("spec")
(call_expression
  function: (identifier) @_fn
  arguments: (arguments (string (string_fragment) @import.source))
  (#eq? @_fn "require"))

; dynamic import("spec")
(call_expression
  function: (import)
  arguments: (arguments (string (string_fragment) @import.source)))
