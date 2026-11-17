# Creator Studio

Creator Studio is the professional production suite specified in the
[product contract](documentation/creator-studio/product-contract.md).
Seven workspaces share meaning, selected standards, commentary, versions and
repeatable approaches. The Worldwright approach supplies choice of journey,
composition with other people's methods, learning, improvement and exchange.

All new application behaviour is authored in Encounter. The selected compiler,
lowering, admission, inverse-edit owner, kernel and native mechanisms are
retained from `../usewords-lightning`; the predecessor is not changed. Internal
legacy host names identify that mechanism lineage, not a second product source.

The source contract is [AGENTS.md](AGENTS.md). `source/origin.json` retains the
vendor hash inventory. The product's actual delivery status and capability
boundaries belong in the
[implementation ledger](documentation/creator-studio/implementation-and-assurance.md).

The static publication is generated with the existing host:

```powershell
node bootstrap/build.mjs
$env:USEWORDS_PORT = '4207'
node bootstrap/serve.mjs
```

The server environment variable is a retained host interface. New domain
behaviour and assurance are Encounter processes; generated JS and process JSON
are not authored source. Local data, review packets and receipts must retain
their actual identity, storage and authority limits.

Run `npm test` for the Encounter assurance cases. Run rendered observations with
`node bootstrap/cli.mjs creator-rendered-assure assurance/browser-rendered.request`.
The packets and reports under `assurance/` are inert evidence. The package
metadata is emitted by the `cs.packageMetadata` Encounter query; no new native
application script supplies these commands' semantic decisions.

The files under `documentation/` are publication copies of the programme's
canonical product, implementation and Worldwright accounts in the parent corpus.
Their provenance and refresh rule are recorded in that directory. Read the
implementation ledger for the exact supported formats and unimplemented adapters.

## Encounter owners and JSON projections

The authored bootstrap records live under `source/owners/`. The retained
canonical example, page tree, stylesheet plan, language catalogue, commands,
journeys, workspace seed and runtime manifest each have an Encounter owner.
`cs.packageMetadata` owns the npm manifest. The bootstrap reads the resulting
JSON projections at their existing paths. Build and test both run the Encounter
projection check, which compares every projection's SHA-256 against the
serialized owner output.

Run `npm run --silent project:source` to emit the complete path-to-value
record. To refresh one projection, pass a request with a `file` field to the
retained CLI. For example, a request containing
`{"file":"source/words.json"}` selects the command grammar.

```sh
node bootstrap/cli.mjs creator-project-source /path/to/request > /path/to/staged.json
```

Stage the output separately, then replace the selected projection and run
`npm run check:source`. The CLI loads the current bootstrap inputs before
emitting the replacement. Keep the selected frontend profiles, vendor files and
historical evidence at their recorded paths.

### Native browser build

Run `npm run build` with the native Encounter executable on `PATH` or set
`ENCOUNTER_BIN`. The build writes `native-dist/` by default. Set
`ENCOUNTER_BROWSER_OUTPUT` to a fresh directory to compare two builds.
The direct command from this app's directory is

```sh
encounter build --browser . bootstrap/native-build.rel ../encounter-libraries native-dist
encounter browser-host --release native-dist "$RECEIPT_SHA256" 0
```

Capture `RECEIPT_SHA256` from the verified build and retain the digest separately
from the release directory.

The output contains the admitted image, pinned launch declaration, assets,
source projections, maps, and `build-receipt.rel`. Serve only the assets directory.
The receipt measures the native input closure and the output files. That
closure has its own program identity. Browser saves from another program
identity require their own migration. The prior publication and launcher
remain the rollback path.
