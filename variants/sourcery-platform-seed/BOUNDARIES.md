# Ownership and effect boundaries

## Kernel

The kernel owns only unavoidable machine mechanisms: typed filesystem, SQLite, process, transport, runtime-loader, clock, randomness and cryptographic adapters; exact byte/state observations; and effect receipts. It does not choose policy, authority, defaults, compatibility or application outcomes.

## Platform

The platform owns authored algebra for object identity and provenance, workspace and authoring lifecycle, package and executable closure, qualification/admission/activation/serving separation, authority, custody, recovery and retirement. It reaches effects only through kernel ports.

## Shell

The shell owns authored algebra for MCP/session state, the just-connected state, available-action/refusal projections, human hold/stop/return and reflection-driven auto-UI composition. It does not own platform authority, application-domain policy or scheduling.

## Existing owners

Shared expression/process interpretation, codecs and byte mechanisms remain with their accepted package owner. Qualification and Git receiving remain distinct external owners. Reuse does not collapse authority, custody, acceptance or external-effect Seams.

## Migration

Semantic correspondence is required; accidental legacy implementation structure is not. Symmetry breaks are recorded faithfully. Accidental compatibility Seams remain until every consumer crosses, blocking residuals close, legacy execution is unreachable and an accepted retirement witness exists.

