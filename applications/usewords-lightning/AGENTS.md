# Usewords source contract

- Follow the product's philosophical spine in `README.md#philosophical-spine`:
  AI helps participants structure, explore and work with what matters. Preserve
  uncertainty and faithful disagreement; resolution is an optional outcome.
  Keep AI framing contestable, acceptance meanings explicit, disclosure scoped
  and authority separate from assistance. Distinguish these product requirements
  from capabilities actually implemented by the local prototype.
- All application semantics, word interpretation, UI decisions, inspection,
  replay, refusal and acceptance policy belong in admitted process algebra.
- `dist/` is generated. Never edit it or use it as an authoring input.
  The page, stylesheet, command grammar and runtime manifest are owned by
  `source/owners/*.encounter`. The build emits their JSON projections and
  compiler source maps under `dist/source/`.
- The editable process owners are `source/usewords.encounter` (retained demo),
  `source/workspace.encounter` (authoring and constructs), and
  `source/workspace-ui.encounter` (app-local workspace orchestration and custody).
  The shared workspace modules live in `../encounter-libraries/workflows/`.
  Matter creation, validation and AI brief/response contracts are owned by
  `source/matters.encounter`; their local UI and persistence are owned by
  `source/matters-ui.encounter`. Matter management's closed operations and
  authority are owned by the shared `matter-management.encounter`; its register,
  attention and form orchestration by the shared `matter-management-ui.encounter`.
  Separate preparation, disclosure, personal statements and reproducible
  packets use the shared `party-work.encounter` and `party-work-ui.encounter`.
  App-local preparation custody stays in `source/party-work-ui.encounter`.
  Their browser storage separation is a simulation, not protected privacy.
  `platform/parties.encounter` is an inactive authenticated receiver policy;
  tests using supplied trusted contexts do not prove identity or transactions.
  These domain operations use the same collaboration review/replay path;
  retained Encounter object-field edits continue to use `ec.patch`.
  AI suggestions are untrusted proposals and
  incorporation never establishes truth, consent or resolution. Keep the
  BYO-agent handoff explicit; do not label deterministic templates as AI.
  Compile them through the selected pinned Encounter frontend; never restore a
  root `algebra/usewords.process.json` owner or a parse-failure fallback.
- `platform/service.encounter` is an inactive platform policy candidate. Keep
  its proposed commands and pure-policy tests distinct from live admission,
  transactional persistence and public deployment. See `platform/README.md`.
- The Worldwright presenter is retained in
  `source/presentation/source-algebra.encounter`. Reuse it for code views;
  preserve exact text/hashes and keep highlighting distinct from validation.
- Retained mechanisms and algebra under `vendor/worldwright/` are byte-pinned
  in `source/origin.json`. Do not edit them to work around an application fault.
- Usewords's semantic edits must use the retained `ec.patch` route. Do not add a
  second patch implementation, raw host callbacks, or arbitrary code execution.
- Native ports provide mechanisms. New effect authority needs an explicit
  grant and boundary description; the process budget remains 20,000,000.
- Keep the canonical site untouched. This is an isolated application candidate.
- Run `npm test` and `npm run build` after changes. Acceptance fixtures are bound
  to the exact process closure; regenerate only after reviewing the source change.
- Browser-local acceptance is not protected server admission or proof of human
  identity. Preserve this distinction in the interface and receipts.
