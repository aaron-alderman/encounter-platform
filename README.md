# Encounter platform

This private source baseline records four packages from aaron-dev: Encounter Authoring, Work Boards, Portfolio and the Rust runtime. The first commit records the selected server bytes. The earlier upstream history was not available in these source roots.

Package paths under `applications/` retain the sibling layout used by the release catalogue and browser transport. Each package owns its existing application declaration and verification assertions. The included vendor files are measured foundation inputs.

## Dependencies and qualification

- Build the Rust runtime against the separately supplied Temple3 source at `research/temple3/`, pinned for this baseline to `a78ee5ce96c7e05eed28e05ef9456e39892032db`. On aaron-dev use the existing offline Rust and Node/browser profiles.
- Claimipedia is a separate application. The retained runtime source includes integration profiles and tests for it. The historical aggregate catalogue requires an external Claimipedia checkout. The platform-only qualification omitted its single catalogue row in a disposable copy and checked the resulting 12-app archive. The Rust attachment comparison now uses the shared Node attachment reader in `shared/node/attachment.cjs`. Its bytes match the Claimipedia host mechanism used to qualify the baseline. Claimipedia retains its own copy because its host basis hashes that file.
- The three Node app bootstraps use the REL codec and isolated regex mechanism under `shared/node/`. Each app retains its own lazy regex worker and queue. The Node hosts measure both bootstrap entry files and shared implementations. This changes the host basis. Prepare new reviews on the new basis when changing versions.
- The compiler front door and policy machine implementation also live in `shared/node/`. Each bootstrap supplies its own foundation path, seed mechanisms, observation ports and regex service. Policy machine caches are app-local. Hosts measure both the local adapters and the shared implementations.
- The Node app bootstraps use the shared SQLite revision store in `shared/node/store.cjs`. Hosts measure both the local entry file and the shared implementation. The store implementation retains the existing SQLite schema and revision protocol.
- The seed source reader, synchronous seed driver and Temple kernel bootstrap live under `shared/node/`. Hosts measure their local entry files and shared implementations. Each app retains its pinned foundation and its own policy machine. The native seed reader remains confined to that foundation.
- The Node value ports and browser-effects mechanisms live under `shared/node/ports/`. Hosts measure the local entries and shared implementations. Each browser effects instance still receives its own host, dispatch and markup guard.
- The Node markup observer shares inert HTML tree conversion and leaves admission to Encounter. Authoring, Work Boards and Portfolio load one vendored parse5 and entities tree under `shared/node/vendor/`. Its code, licenses and version pins come from the byte-identical former app-local copies. Hosts measure the local adapter and shared implementation.
- The platform foundation lives in `shared/foundation/`. The three app-local `bootstrap/foundation.rel` files select that fixed root. Both loaders retain the original logical paths, manifest bytes and source pins. Rust images embed the foundation under those logical paths and still require the exact runtime binary that built them.
- The nine HTML and CSS modules are shared under `shared/rendering/`. The local `bootstrap/rendering.rel` selector enables that root for declared HTML and CSS modules only. Declarations and Rust image file keys keep their original logical paths.
- `shared/admission/` preserves the three remaining copies of the earlier effect and ownership algebra as one reference set. Current application declarations and the pinned foundation do not select these files.
- The five Authoring application modules are shared under `shared/authoring/source/`. The local `bootstrap/authoring.rel` selector applies only to those five logical module names. All three default Authoring declarations keep their original paths and bytes. Product-specific source remains package-local.
- Use disposable stores and free loopback ports for verification. Keep application state, private datasets, generated releases and test evidence outside the source history.

The baseline review, exact source manifest, transport diffs and verification receipts remain in the aaron-dev workspace receipt store.
