# Source-grounded V/V+ codec checkpoint

The earlier scoped-codec study lost named referents and domain predicates. The new codec can add exact lexical spans as terms, predicates or unary qualifiers, with a retained record ID, version, source hash and offsets. These bindings can fill shared role slots. Clause status, quantifiers, modality and coupling remain formula structure. The study uses the original frozen decoder for the fixed arms and carries its grammar into the grounded renderer. The renderer extension is additional implementation surface.

On the already studied Cross claim, the prototype rendered Father, Son and Spirit as three distinct anchored roles, used the anchored predicate punishing with ordered actor slots, and used the qualifier together on the joint cost clause in the scope of Cross. This was a development example of recovered lexical content. No exact reconstruction judgment was made.

Development checks matched all 16 archived fixed-vocabulary renders across the eight earlier scoped programs and both coupling settings. Checks confirmed that the grounded arms differ only in the link payload. The prototype rejected a mismatched quotation, partial-word span, blocked connective, overlapping anchors, invalid predicate arity, a lexical predicate in the fixed arm, and attempts to put lexical operators or atoms in a coupling. A separate temporary fixture exercised opaque-arm output, scoring, and the interaction contrast. The frozen sample and manifest hashes verified for all 12 claims. No new holdout text was displayed for encoding, and no holdout scores were computed.

A correct span can still be assigned the wrong role, arity, qualifier scope or claim meaning. Grounding therefore establishes a link to the original wording. Reconstruction and unsupported assertions require the separately preregistered probes. The disposition is to retain the codec and frozen design as a research prototype, with semantic efficacy pending the comparison. There is no application integration or claim admission.

## Study execution

Use `python3 -B study.py verify` to confirm the frozen method. When the comparison begins, `python3 -B study.py show` opens the selected records and prints their assigned encoding order. Record probes as an object keyed by claim ID with a list of objects carrying `kind` and `text`. Run `python3 -B study.py freeze-probes` before encoding.

Write `encodings.json` keyed by claim ID, each value containing `fixed`, `grounded`, and `bindings`. The two programs use the previous scoped AST with optional `@name` references in the grounded program. A binding records `kind`, `start`, `end`, `text`, and `arity` for predicates. Run `python3 -B study.py decode` for four outputs per claim under opaque arm IDs. Write `judgments.json` keyed by claim ID and opaque arm ID, with a binary `flags` string in probe order and an `unsupported` list of reasons per output. Run `python3 -B study.py score` to generate the four-arm and paired results.
