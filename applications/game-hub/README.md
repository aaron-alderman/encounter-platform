# Game Hub

An Encounter application for One World, Asset Foundry, Landscape Foundry and
the design reference library. Recent Folio links to two playable activities in
One World: dispatching an export shipment and building a rail spur at the mine.

- Asset Foundry opens 13 assets in five groups from the supplied repository.
  Each asset shows intake, draft, validation, and verified candidate status
  with its recent saved revisions. The improvement form changes the texture
  dimension limit, LOD ratios, and geometric error limit. It can add a Detail
  LOD between High and Medium. The compiler verifies the candidate before
  Encounter saves the new recipe and candidate together. The result compares
  measured triangle counts and texture size with the previous build and
  offers verified GLB downloads up to 16 MiB per file.
- Landscape Foundry opens the recovered coastal project. Drag to orbit,
  scroll or pinch to zoom, and click or tap the terrain to set the edit
  centre. Preview the terrain operation and commit that exact preview with a
  reason. The journal supports undo, redo, and verified local packages.
- One World opens the recovered One Shipment scenario. Dispatch shipments,
  advance the clock manually, and build or revise a rail spur at the mine.
  The authority replays up to 48 saved commands against the pinned world basis.
  **Foundry inputs** lists the current and previous verified build per asset
  and the 12 latest terrain workspace revisions. Applying inputs verifies
  the selected asset bundle, replays the selected terrain journal and places
  the high LOD on that surface. One World saves the source pins and renders
  the composed GLB in its 3D scene. The scene draws existing and built rail
  from the One Shipment authority and animates dispatched shipments when
  the operator advances the clock. The overlay fits the regional and local
  rail geometry to the selected terrain for display. Movement interpolates
  between accepted clock positions.

The browser forms, command selection, revision checks, and persistence are
Encounter. The opt-in game kernel port calls the original asset compiler,
terrain journal and renderer preparation, and One World simulation authority.
The 3D comparison opens by default with the original source and the latest
verified build. Worlds & tools stays above the scrollable asset explorer, which lists assets
under expandable groups. On narrow screens, use the document picker to switch
workspaces and **Browse assets** to open the asset explorer. Choose a build LOD and drag or zoom either pane to move both
cameras together. The original source can be previewed before a build.
The workbench also shows wireframes and schematics. Asset Foundry builds local
candidates for review and download. Higher texture limits can preserve more
detail where the recovered source has it. High LOD uses the source mesh,
and the compiler reports the measured geometry for each reduced LOD.

`catalog.encounter` owns the document catalog and image pins.
`desktop.encounter` owns the request handler, navigation, document views and
image selection. `presentation.encounter` owns the style rules and uses the
shared Encounter CSS serializer. The notebook caption, evidence labels, source
coordinates, and syntax palette share the Encounter contract used by the
Semantic decompiler.

Each editor opens in Workbench. Trace records the latest submitted command
per editor in the current browser session. It shows branch outcomes, checks,
completed or faulted effects, caught refusals, and the revision returned by
a successful storage write. It observes Encounter editor processes and
their effect boundaries. The native game engines appear as effects.
Capture is limited to 256 events per command and shows an omission count
when that limit is reached. Trace contents clear when the session ends or
the server restarts.

Trace map lists declared branches, checks, and effects by process and
compiled address. Both views use the same source coordinates. Source opens
the corresponding statement only when the link, admitted module SHA-256,
and statement digest match. Receipts shows stored workspace revisions,
with the document SHA-256 and application basis for each. The Files tab
holds the retained captures and references.

## Open Game Hub

Choose **Game** from [AppDev Projects](https://appdev.sourcerytech.com.au/)
or open [Game](https://appdev.sourcerytech.com.au/game/) directly. The Game
gateway checks the approved Sourcery identity before serving the workspace.

## Front Gate development access

Open **Game Hub** from [Encounter Front Gate](http://localhost:24220/) or go
directly to [Game Hub](http://game-hub.localhost:24220/) over the existing Front
Gate SSH forward. The same list links to North River’s HTTPS pilot.

If the Front Gate forward is closed, start it from your machine:

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:24220:127.0.0.1:24220 aaron-dev
```

Front Gate proxies the loopback app on server port 24241. The backend runs as
the user unit `encounter-game-hub-preview.service`.

## Build and run

From this directory, source the workspace profile. The game migration intake
provides the locked Three.js renderer. The release builder projects the viewer's
`.program.encounter` trees, generates the pinned REL asset manifest and source
map, and checks the package before publishing the output directory.

```sh
source ../../../environment.sh
source ../../../env/temple3-linux-toolchain/environment.sh
node ../../encounter-platform/shared/node/loader-declarations.cjs --check application.rel

game_target="$DEV_ROOT/state/game-preview-diagnostics-runtime-target"
cargo build --manifest-path ../encounter-runtime/Cargo.toml --locked --offline --release --target-dir "$game_target"
cargo build --manifest-path ../../encounter-core/Cargo.toml --locked --offline --release
node build-release.cjs "$game_target/release/encounter" \
  ../../encounter-core/target/release/encounter "$operator_launch" "$new_package"
```

Set `operator_launch` to the operator's REL image-mode launch configuration and
`new_package` to a fresh output path. The launch configuration identifies the
persistent store and grants access to the platform's pinned `game.kernel`
provider. Both paths resolve outside the app package in the deployed profile.
Start the package with `"$new_package/encounter" --config "$new_package/launch.rel" serve`
after freeing the configured port. The gateway uses the package's `gateway/`
source directory and its own operator-managed REL configuration.

Regenerate `application.rel` from `application.loader.encounter` with the
loader tool's `--write` option after editing the declaration.
