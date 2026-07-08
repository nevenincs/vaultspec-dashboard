; Python import surface (codebase-graphing ADR D2).

; import a.b, c.d          — each dotted_name is one module reference
(import_statement
  name: (dotted_name) @import.module)

; import a.b as x
(import_statement
  name: (aliased_import
    name: (dotted_name) @import.module))

; from a.b import c        — module_name is the dependency; the imported names
;                            may be symbols OR submodules (resolver probes both)
(import_from_statement
  module_name: (dotted_name) @import.from)

; from . import x / from ..a import b — relative form; the resolver reads the
; leading dots plus the optional dotted tail from the captured text
(import_from_statement
  module_name: (relative_import) @import.from.relative)
