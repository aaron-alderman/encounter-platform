# AppDev workspace

The Encounter declaration renders the homepage. The native Encounter workspace
host serves the rendered page, X identity, and the Temple phone controller. A
separate loopback Encounter browser host runs the workspace and controller
interactions. Nginx exposes its shared bridge and same-origin WebSocket at
`/_encounter/browser.mjs` and `/_encounter/browser`.

From the server workspace, source environment.sh, then render from projects/.

    encounter-core/target/release/encounter check . applications/appdev-projects/application.rel
    encounter-core/target/release/encounter run --declaration . applications/appdev-projects/application.rel RELEASE_ID > /path/to/release/index.html

Home shows the supplied release ID in its title banner, with a 12-character
fingerprint of the rendered Home build beneath it. Local renders without a
release ID use Development as the build label.

Build the native runtime from `projects/encounter-core/Cargo.toml`. Stage the
executable as `encounter` beside the rendered `index.html` and the native Windows
connector. The systemd unit runs `encounter workspace-host --follow-release RELEASE` against the
bundle selected by `/var/www/appdev-projects/workspace`. Make the release files
readable by both dynamic service users and the `encounter` binary executable. Stage
`browser.rel` and its modules under `browser-programme/` at their paths relative
to `projects/`. Copy the rendered index to `browser-assets/index.html`. Copy
this app’s `fonts/` directory into `browser-assets/fonts/` for the Customization
preview and its bundled font licenses. Install `appdev-browser.service` alongside `appdev-workspace.service`. Install
workspace.nginx.conf as a server-level include for the HTTPS AppDev host and
workspace-limits.nginx.conf at Nginx's http level. The previous static root
location and its index can serve as rollback.

When staging Home, project the shared Sourcery OS stylesheet from the
rendered Home page. Embedded readers use the generated theme from the
active release. Include it in the package receipt.

    encounter run --stdin applications/appdev-projects release/shared-style.rel < RELEASE/index.html > RELEASE/browser-assets/sourcery-os.css

Run `encounter check-package RELEASE` before installation. Stage only the
declared programmes, datasets, static assets and platform-provided binaries.
The Notes page loads `/_encounter/browser.mjs` from the native browser host.
Remove the old `browser-stream.mjs` copy and its static nginx alias when
building a release. The service template supplies `--allow-aster-stream`
and `browser.rel` declares `browser.asterStream`. The same-origin
`/workspace/aster/events` proxy must reach the Aster service's event endpoint
without forwarding browser cookies.

## Sourcery Workspace Terminal

Run `encounter sourcery-workspace https://YOUR-WORKSPACE-HOST`. Open the
printed Temple sign-in URL in a browser, then enter the code shown in the
terminal on the approval page. If the link sends you to the regular Temple
sign-in page, finish signing in and reopen the terminal’s approval link.
The code expires after five minutes and is
used once. The terminal keeps its read-only credential in memory and asks
the workspace host to end the terminal session when it exits. The host
rechecks the linked Temple session on each read.

Use `/text` to filter, `n` and `p` to page through results, and a number
to inspect a catalogue entry. Press `f` to list authorized files, and
enter a number to open a file. Text previews
appear in the terminal. Apps and files that require Web describe the
fallback in the terminal. This slice uses the ordinary Temple file policy
for Platform collections. Files requiring a separate app gateway session
do not appear.

For a terminal-only instance, set `APPDEV_TERMINAL_ONLY=1` on
`encounter workspace-host` and leave the browser host stopped. Publish only
`/workspace/terminal/` and the Temple sign-in and identity gateway paths
needed for approval. The release still uses the regular Home package and
load-time checks. The identity pages are used for sign-in only. The catalogue
and file previews are served by the workspace host without the browser programme.

Run the focused check from the server workspace after sourcing
`environment.sh` and building the Encounter release binary.

    python3 projects/applications/appdev-projects/verification/workspace-routes/terminal.py

The verifier starts a terminal-only workspace, the real identity gateway,
and the file-index service against a disposable identity provider. It drives
the terminal client and checks both a steward's file preview and refusal
for a signed-in member requesting the same file.

## VM Manager

Open **VM Manager** from AppDev Home and select a VM on the left. For
**Sourcery OS Dev**, use **Serial** to send a line such as `help`. Use
**Display** for the live framebuffer, guest keyboard, and mouse.
Press **F1** with Display focused to open Encounter IDE, **F5** to run the
example, and **Esc** to return to the guest prompt. On a guest with a
desktop, click a launcher or window to focus it and drag a title bar to
move the window. The two views share one session and changing views
leaves the VM running.

Selecting **Linux Dev** opens Sourcery Workspace Terminal in a Linux guest.
Follow the Temple approval instructions printed in the terminal. Each
connection starts a fresh terminal process. The Platform steward can attach
one controlling session per VM. Closing or minimizing the window releases it.

Set `APPDEV_VM_REGISTRY` to an operator-managed REL file readable by
the workspace service. The workspace service must be able to connect to the
private Unix sockets. The AppDev ingress forwards the WebSocket upgrade at
`/workspace/vm-manager/console`. A dedicated
`encounter appdev-vm-manager RELEASE` listener can serve the VM Manager page,
assets, and console routes using the same identity gateway.

    ("registry", "format", "encounter/vm-manager/1")
    ("registry", "guest", "sourcery-dev")
    ("sourcery-dev", "title", "Sourcery OS Dev")
    ("sourcery-dev", "serialSocket", "/run/sourcery-vm-manager/com1")
    ("sourcery-dev", "displaySocket", "/run/sourcery-vm-manager/sourcery-display")
    ("registry", "guest", "linux-dev")
    ("linux-dev", "title", "Linux Dev")
    ("linux-dev", "terminalSocket", "/run/sourcery-vm-manager/linux-terminal")

Registry Demo Display uses Workspace sign-in followed by a Platform steward
approval. An approval opens one display session and expires within an hour.
The display shows the expiry time and an **End steward session** action.
Its launch identifier is bound to the AppDev session and required for the
Registry Demo WebSocket. Refresh and reconnect reuse the same authorization.
A new launch requires a new approval.

The AppDev identity gateway issues a 24-hour Workspace cookie and continues
to check the upstream identity on protected requests. The upstream identity
service must issue sessions of at least 24 hours for the full duration to be
available. If VM Manager has its own listener, forward GET and POST for
the exact `/workspace/vm-manager` route and send the console upgrade to the
same listener. Keep request logging disabled for both routes.

Run `vm-manager-vbox-display.py SOCKET VM_UUID` as the VirtualBox owner
with the configured `VBOX_USER_HOME`. Each provider binds one private
socket and accepts framebuffer capture, mapped guest keys, and pointer
input for its configured UUID. For Linux, run `vm-manager-linux-terminal.py guest PORT CERTS ORIGIN`
in the guest and `vm-manager-linux-terminal.py manager FORWARDED_PORT CERTS SOCKET`
on the host. Forward the guest port to host loopback. Give each side its own
`guest.pem`/`guest.key` or `manager.pem`/`manager.key` and the peer's public
certificate. The guest certificate uses the DNS name `linux-dev`.
The guest runs only the configured Workspace client as UID 65534.

After sourcing `environment.sh`, verify Serial and Display with the
running native dev VM and its two private sockets.

    python3 projects/applications/appdev-projects/verification/workspace-routes/verify.py --vm-console /path/to/com1 --vm-display /path/to/sourcery-display

To verify the Registry Demo sign-in and approval journey, set
`APPDEV_REGISTRY_STEWARD_PROOF=1` and pass the Registry Demo's own COM1 and
display sockets. This runs the Workspace UI in Chromium and checks the
sign-in callback, approval replay, scope, and the end-session action.

The same Chromium journey can verify Linux with a disposable, terminal-only
Workspace. Set the Linux guest's origin to `https://workspace-linux.test`,
map it to the fixture HTTPS port, and trust the fixture's `workspace.pem`
in the guest. Use `terminal.py --port PORT --certificates DIR --serial SOCKET
--display SOCKET --terminal SOCKET` from the same verification directory.
The proof opens a catalogue entry and an authorized REL file.

The guest console browser policy is authored in Encounter and compiled to
WebAssembly. The browser adapter supplies WebSocket, framebuffer, focus, and
input APIs. Set `APPDEV_REGISTRY_CONSOLE_WASM_PROOF=1` alongside
`APPDEV_REGISTRY_STEWARD_PROOF=1` to verify loading the compiled policy and
check real framebuffer changes after keyboard input, clicks, and dragging.

## System Catalogue and Home window admission

Open **Home → Operations → System Catalogue**. Expand **Sourcery OS** in
**System structure** to see the workspace entries. **How Home fits together**
shows the relationships between Home, the Home shell, the launcher window,
and System Catalogue. In the tree, **Home shell** contains the **Sourcery
Workspace** launcher window. **Home** also lists the apps in its desktop
registry. Each app expands to its
declared window. Expanding any item shows its type, admissibility criteria and
rule source. Work, Platform and Mobile show their entry criteria. Their app
inventories belong to their own surfaces. Select a published Encounter
reference to open File Viewer. It uses the Home release index and highlights
the named process with surrounding lines when the Platform steward can read
it. The release publishes numbered excerpts within the file index preview
limit. Run `encounter appdev-publish-catalogue-excerpts PACKAGE` after rendering
Home and before pinning the package receipt.

The other sections list app launch and task details, window types and specimens,
semantic elements, style entries, and Encounter syntax roles. In **Window types**, Sourcery Workspace is listed as
the Home shell window, with its Document type and supported controls. The
title-bar baseline uses Maximize / Restore, Minimize and Close. Workspace
offers the first two, Document app windows offer all three, and Compact app
windows offer Minimize and Close.

Home interaction Assurance exercises all five
sections and checks that the task restores the selected section.

From `projects/`, run the read-only catalogue or prepare a draft layout:

    encounter-core/target/release/encounter run --declaration . applications/appdev-projects/window-catalogue.rel
    encounter-core/target/release/encounter run --declaration . applications/appdev-projects/window-catalogue.rel prepare
    encounter-core/target/release/encounter run --declaration . applications/appdev-projects/window-catalogue.rel prepare document

The catalogue emits typed REL from the Home desktop registry and shared window
types. It identifies each entry's source, path, launch action, window, task,
declared type and layout admission result. Customization supplies the preview
specimens, semantic roles and their existing consolidation decisions, properties,
style entries, and Encounter syntax roles.

The first worked path is **Home → Operations → Sourcery OS Customization**.
Its default Open action targets an independent Compact window
(`notes-design-demo-window`) and reopening focuses or restores it. The
Customization app separately hosts specimens of both window types. The Settings
dialog specimen uses Compact composition. Actual shell-dialog launch remains
subject to the registered Home settings controls.

Draft preparation can suggest Compact for an omitted independent window type.
The output gives the proposed value and its origin for review. Record the
accepted value in the app registry. Home admission and rendering require an
explicit known type. For a refusal, run the catalogue and look for an entry
with `layoutAdmitted` false, then use its path and source to fix the declaration.
The frame requires title and content for Compact, and title, menu, banner and
content for Document. The frame also rejects populated slots outside the type.

The initial alignment made the ten formerly implicit Compact entries explicit:
About this build, Assurance, Performance, Customization, Certificates, Steward,
Keys, Store, Game Zone, and Front Gate. The five existing Document entries keep
their declared types. The Workspace window and settings dialog use named type
lookups. Keep future window declarations explicit and choose slot contents from
the selected type.

From `projects/`, run the focused acceptance and refusal checks:

    encounter-core/target/release/encounter test --declaration . applications/appdev-projects/verification/window-catalogue/check.rel

## Workspace entry URLs

Use /workspace/home, /workspace/work, /workspace/mobile and
/workspace/platform in the environment switcher. The root URL redirects to
the saved default for the signed-in Temple identity, or Home. Change the
default under File on Home. Platform entry and its availability as a default
follow the configured Platform steward.

The backend workspace policy runs through the fixed `workspace.environmentPolicy`
and `workspace.fileVisibility` operations in `workspace.encounter`. The
same module selects legacy redirects and Platform views. The native host
supplies the parsed request, the verified Temple email, the configured steward
email, the saved preference and the authenticated file provider results.
Encounter selects the permitted destination and file roots and renders the
preference picker.

| Native mechanism | Binding |
| --- | --- |
| Workspace identity | Fixed identity gateway `GET /identity-management/workspace-access` |
| Preference storage | One private record per verified Temple principal |
| File provider observations | Fixed Game Hub folio, Store fragment, and North River project reads |
| File data | Private index socket with the Encounter-selected roots and an optional file ID |
| HTTP and Temple connection | Send the selected redirect, page, or subscription response |

The policy adds no native grants. Release staging and serving require both
policy operations to be present and to deny unauthenticated Platform and file
access. Roll back to a prior package using that package's own runtime.

The Work page proxies to the Work gateway on loopback port 24251. Use the
updated gateway runtime so rewriting preserves the canonical switcher links.
Install the exact /life-board and /life-board/ redirects alongside the existing
prefix location. The prefix still serves Work assets, the browser socket, the
sign-in callback, Super CRM, Workgarden, and the Semantic Decompiler. Use the
same hosted Aster overlay and Content Security Policy for /workspace/work as
for the original Work page.
Mobile's preparation page is slashless. Its phone and offline assets stay
under /workspace/mobile/.

The AppDev host checks the existing identity-management gateway session through
its loopback workspace-access endpoint. The gateway and workspace host must
use the updated runtime and the same configured upstream authorization.
APPDEV_IDENTITY_GATEWAY defaults to http://127.0.0.1:24256. Roll out the
gateway runtime before switching on the new workspace routes. Roll out the
Home renderer, browser programme, workspace host, and Work shell together.
The workspace host filters the Platform card and direct Platform entry using
the same steward session. Preserve Home's Front Gate frame policy on
/workspace/home when moving the entry off /.

Home and hosted Work render the Sourcery OS header and taskbar through
`applications/encounter-libraries/workspace-connection.encounter`. Their
Start menus and task lists are workspace-specific. Home account controls live
in File. The AppDev ingress combines the Home policy with the exact Aster
stylesheet allowance when it adds the Aster overlay. Pages with the shared
taskbar use its Start control in place of the overlay's fallback menu.

From the server development workspace, source environment.sh, build the
Encounter release binary and run
python3 projects/applications/appdev-projects/verification/workspace-routes/verify.py.
The verifier starts temporary loopback services, nginx and the browser.
It uses a fixture identity provider with the actual gateway session flow.

## Workspace launch links

A workspace launch link opens an app or selects an item on entry. For example,
`/workspace/home?view=inbox` opens Home Inbox and
`/workspace/platform?view=work-items&item=…` selects a work item. The browser
captures the original address once per document and removes the query from the
workspace address without adding a history entry. The AppDev and Aster
receivers use that same original address even when their browser modules connect
in a different order. Each receiver gets its launch only once. A WebSocket
reconnect rebinds the handlers and leaves the current window state in place.

Use canonical workspace paths when generating new launch links. Existing
queries and demo fragments still work as entry instructions in their owning
environment. Service URLs such as identity callbacks, pairing invitations and
fragment requests keep their own protocols. The staged workspace verifier also
covers forced WebSocket reconnects and checks that Inbox and Aster requests are
not replayed. Roll out the new browser runtime with the AppDev, Work and
Aster browser declarations that grant the startup port.

## Open Store inside a workspace

Store opens in Home and Work. A release link such as
/workspace/work?open=store&play=one-world-0.1.0 leaves /workspace/work in the
address bar and loads the release inside the Store window. The selected release
waits in tab storage for up to ten minutes while the user signs in. The Store
gateway returns to the originating workspace in the same tab. Reconnecting
reconciles a completed open without fetching or focusing the release again.
The full 3D player and installed Encounter app runner keep their own surfaces.

To exercise the staged gateway and browser flow without the rest of the browser
suite, run verification/workspace-routes/verify.py with --store-only. The
fixture supplies Temple accounts and release data. The production Store
gateway must be updated alongside the workspace programmes for the return
route to work.

## Operations app launch contract

Declare an Operations app with its own flow in `desktop-launch.encounter`.
It uses the independent desktop window, task button, and focus-or-restore
default action. The Home settings dialogs are registered shell controls.

The Home render checks each launcher against this contract. The workspace
host also checks both rendered entry pages when it loads a release and
requires Encounter/REL source in `browser-programme/` and
`version-programme/`. The release must carry `desktop-launch.encounter`
in both programme closures. The normal package gate also applies.

## Home managers

Open File Manager from the desktop directly below Workspace. Start groups
shortcuts into Workspaces, Workspace tools, and Apps. All apps opens the
Workspace app catalogue. Service Manager and Temple Manager also appear
on Home's Operations tab.

Declare `layout = "document"` for an independent window that browses records or
files. `desktop.documentShell` supplies the File and Help menus, banner, and
named scroll panes. File includes the standard Close action and accepts any
additional app commands. The window keeps the title, menus, banner, tabs, and
location visible while the index and detail panes scroll independently. The
panes stack on narrow screens. An app can omit the index to use a single
scroll pane. Update the contents of the panes to preserve the window chrome and
keep navigation state across detail changes.

Open **Documents** in File Manager to browse text saved by Text Editor in
this browser profile. Choose a folder, then click a text file to open it in
Text Editor. To list a file saved by the earlier browser editor, open it by
path in Text Editor and confirm **Save**. If two tabs save at the same time,
the tab that receives a save error can retry from its open dialog.

File Manager also reads indexed Platform and Kernel releases, Game Hub assets,
published Store assets, and North River source and receipts. The folder list
and file details include logical byte sizes, ownership or stewardship when
recorded, and the read policy. Folders show both total size and the size after
counting identical contents once. Use **Open in File Viewer** on supported
files to open a separate read-only window. It supports published Platform
REL, specifications and source, North River source and receipts, and Game Hub
JPEG and PNG through the existing authenticated image route. REL search scans
the verified document and displays up to 100 matching facts. Pinned Platform
release MP4 and WebM files use a steward-only byte-range playback route.
Office Briefcase shows provider availability.

The browser requests the same-origin, read-only `GET /workspace/files`
route when opening, restoring, navigating, or refreshing File Manager. The
workspace host rechecks the Platform steward session and the configured app
gateways before requesting their respective collections. The response excludes
denied and stale collections, including their names and folder totals, and
carries `Cache-Control: no-store`. Catalogue links request the selected file
with `view=file`, which returns only the authorized file row. North River
additionally requires the
committed project owner and image/store revision to match the index.

Run the native reader beside the index watcher under the index account.

    encounter file-index --serve SOURCES_REL CACHE_DIRECTORY /run/sourcery-file-index/view.sock

For the workspace service, provision the socket directory under `/run` with
the index account as owner, a dedicated workspace reader group, and mode
`2750`. Add that group to the workspace service with
`SupplementaryGroups=`. The socket is mode `0660` and the raw cache remains
owner-only.

For systemd, use `RuntimeDirectory=sourcery-file-index`,
`RuntimeDirectoryMode=2750`, and the dedicated reader group as the service
`Group=`. Retain the index account's ordinary group in
`SupplementaryGroups=` and launch the native reader directly. The canonical
unit is [sourcery-home-file-index-view.service](../../encounter-core/deployment/sourcery-home-file-index-view.service).
Stage the Encounter executable from the verified Home package at
`/usr/local/libexec/sourcery-home-file-index-view` as root-owned and executable.
Activate the unit and executable with their matched release. Retire any
earlier reader drop-ins that override `ExecStart` so systemd uses the direct
entry point. A rollback restores the previous executable and its unit
configuration together.

Give the workspace host the following operator settings.

    APPDEV_FILE_INDEX_SOCKET=/run/sourcery-file-index/view.sock
    APPDEV_FILE_INDEX_GAME_GATEWAY=http://127.0.0.1:24242
    APPDEV_FILE_INDEX_STORE_GATEWAY=http://127.0.0.1:24462
    APPDEV_FILE_INDEX_NORTH_GATEWAY=http://127.0.0.1:24230

Use the gateways serving the indexed applications on the same Home origin.
Each provider cookie goes only to its corresponding gateway. Keep the index
watcher at 60 seconds. Views expire after 180 seconds without a successful
refresh. The qualification receipt from Service Manager requires Platform
steward access in File Manager.

Service Manager and the Front Gate window use the same versioned, read-only
status response over the Front Gate SSH forward. Service Manager displays
systemd timer times and the latest completed executions still reported for
services activated by those timers. A timer trigger and a service execution
are separate observations. **View last service execution** opens the observed
invocation. Service Manager matches indexed receipts by the same systemd
invocation ID. **Back to Service Manager** restores that invocation even after
Front Gate reports a newer execution for the unit.

Configure a scheduled receipt publication directory on the file-index reader
and watcher using an absolute location. Receipt metadata and content are
available to Platform stewards.

    ("index", "source", "scheduled-receipts")
    ("scheduled-receipts", "provider", "scheduled-receipts")
    ("scheduled-receipts", "location", "/absolute/path/to/scheduled-run-receipts")

A publisher writes an immutable REL receipt named <invocation-id>.rel using
the job's systemd INVOCATION_ID. The execution facts are invocation-id, scope
(system or user), service (the systemd unit), started (YYYY-MM-DD HH:MM:SS
AWST), result (the systemd result), and duration-seconds (a whole number).
Include both timer (the systemd timer unit) and last-trigger (the timer's
AWST timestamp) when the publisher can attest to that trigger. This keeps
Last trigger tied to the receipt even after a newer execution of the same
service. Additional facts can explain the result. After writing the receipt, atomically
replace publication.rel with the entry and SHA-256 pin included. The next
index refresh exposes the receipt automatically. See scheduled-run-receipts/
for the retained disk-pressure assurance example. Update the Front Gate
collector, file-index reader and watcher, and Home runtime together.

The development user timer in
`dev-jobs/sourcery-dev-front-gate-check.timer` runs the Front Gate directory
declaration test. The candidate service in
`dev-jobs/sourcery-dev-front-gate-check.service` uses
`encounter appdev-publish-front-gate-receipt` for ExecStopPost. Encounter
checks the observed systemd invocation and only records a timer trigger
that matches the completed execution. The native publisher locks the
directory and syncs the immutable receipt before atomically publishing its
pin. The dev installation keeps its enabled user units, publication directory,
and file-index source declaration under
projects/encounter-core/target/dev-front-gate-receipts/.
The installed user service still calls `dev-jobs/publish-front-gate-check.py`.
Keep that publisher until the installed service uses a release driver that
supports `appdev-publish-front-gate-receipt`.
The timer runs shortly after activation, then daily. Point a development
file index at the published directory to see the receipts in Service Manager.

To exercise the desktop windows, file previews, timer and execution views, and
receipt handoff against disposable hosts, run
`verification/workspace-routes/verify.py` under the server browser profile.
Pass `--front-gate-only` to exercise Front Gate refresh, recovery, and the
shared Service Manager status response.

For the local browser Wasm check, set `ENCOUNTER_VERIFY_BROWSER_WASM=1` and
`ENCOUNTER_RUST_HOST` to the candidate Encounter executable, then run the same
verifier with `--front-gate-only`. The fixture exercises Front Gate countdown,
Aster startup and frame context, Mobile Assurance refresh and offline draft
replay, desktop activation, and reconnect. The Home checks enforce the security policy emitted by the disposable loopback nginx fixture
with the Wasm compilation directive. The separate Mobile test context bypasses
CSP so it can exercise the same module without a Mobile policy change.
The catalogued Mobile phone runtime omits the JavaScript policy. Its browser
check verifies that the original CSP stops startup and clears the pairing
fragment, then exercises offline replay with CSP bypassed. The rollback check
replays a trip against the previous Mobile runtime with Wasm disabled.

To prepare both Wasm catalogs and their package receipts together, run
`encounter appdev-stage-browser-wasm APP_ROOT BROWSER_SOURCES SYSTEM_PACKAGE OUTPUT`.
Use the Encounter executable bundled in the input Home and Work packages,
and point `BROWSER_SOURCES` at its matching `browser/` directory. The command
publishes a new staging directory after validating both catalogs and their
receipt pins. Run `check-system` on the new directory to qualify it and
generate its Interaction Assurance receipt. To stage a newly built Encounter
executable from an intact earlier system package, invoke the new executable
with `appdev-stage-browser-wasm --refresh-runtime APP_ROOT BROWSER_SOURCES SYSTEM_PACKAGE OUTPUT`.
The command rebuilds Workgarden and Shop from the packaged source, installs the
new executable in both staged packages, and regenerates their artifact pins.

From the Encounter checkout, run
`encounter build --browser browser appdev.rel browser STAGING_OUTPUT` to
build the `assurance`, `aster-frame`, `countdown`, `interaction`, `mobile`, and `temple` bundle. Copy the
generated `browser-wasm.rel` and `browser-wasm/` into the staged Home package
alongside the same Encounter executable used to build the bundle, before
generating the package receipt. Record the digest printed by the build as
the `artifact` pin for `browser-wasm.rel` in `package-receipt.rel`. The
receipt's `package.runtimeSha256` and `artifact` pin for `encounter` must
match the bundled executable. The root
`browser-wasm.rel` declares `encounter/appdev-browser-wasm/3` and pins each
build receipt by `receiptSha256`. Admission verifies the bundled runtime,
source pins, module bytes, and source maps before serving. The browser host,
Mobile and Temple runtime routes, and `/workspace/aster/frame-bridge.js`
identify verified delivery with `X-Encounter-Browser-Wasm`. Load the Aster
frame bridge as a classic deferred script with the existing host or parent
data attribute so it can read that attribute from its script element.
Both Home bridge URLs serve the same pinned Wasm policy when a catalogue is
present. Catalogued Home omits the JavaScript compatibility implementations
for countdown, interaction, and Assurance.
The fixture refuses altered artifacts, restarts both loopback Home hosts
on the previous package, and reopens Front Gate with Wasm disabled.

With the same environment, `--home-temple-startup` checks the Wasm selection,
subscription, and reconnect decisions in the delayed Temple browser fixture.
The catalogued Temple startup and performance warning scripts omit their
JavaScript policies. The browser checks bypass CSP to exercise Wasm. The stream
check also verifies that the unmodified Temple CSP blocks startup before any
socket opens.

For the packaged Work fixture, use
`encounter build --browser browser work.rel browser STAGING_OUTPUT` and stage
its catalog and module beside the Work executable before generating the
package receipt. Pin `browser-wasm.rel` in Work's own receipt using the digest
printed by that build. `--work-candidate` verifies the served Wasm against that
catalog and checks calls from the Work frame during startup and reconnect.
The Wasm Work check uses a disposable browser context that bypasses CSP.

Add `--frontend-rollback-work PREVIOUS_WORK_PACKAGE` to the local Wasm
`--front-gate-only` check to rehearse Home and Work together. The verifier
stages both candidates, then restarts both Home hosts and the Work host on
their previous packages behind the same loopback ingress. It reopens Front Gate
with the saved countdown preference and signed-in Work with Wasm disabled,
then restores both candidates and rechecks their verified Wasm delivery and
browser startup.

For a staged Work package, pass `--candidate "$home_release" --work-candidate
"$work_release"` to the same verifier. It opens the signed-in `/workspace/work`
route with a fixture identity and checks that the interstitial and workspace
both render from the staged package.

Measure signed-in Work startup with the managed Encounter gateway and Temple
frame. Set `APPDEV_RELEASE_RUNTIME` to the current activation launcher and run
`verification/workspace-routes/verify.py --candidate "$home_release"
--work-performance "$work_release" --work-gateway-policy "$standalone_gateway_policy"`.
The probe reports compact samples at 0, 100 and 200 ms of added delay per
browser exchange. Add `--enforce-work-budget` to run the 100 and 200 ms cases
and fail if either takes one second or longer or exceeds two exchanges.

## Publishing a release

Use `encounter appdev-release` for previews and deployments. Release checks and
deployments that include Home first run the read-only Identity Management
Encounter check against the checkout. It compares the current source scan
and Compiler snapshot with the pinned Decompiler trace. An uncovered
reference, a difference from reviewed evidence, or a check error stops the
release and prints the Encounter report. Isolated previews can still capture
replacement evidence while the reviewed trace is stale.

Home’s Assurance window reads the Identity Management result from the selected
release’s interaction Assurance receipt. It shows Compiler and reviewed trace
coverage, reported differences, findings and uncovered references, with links
to both cases. Older releases without a recorded result show an empty state.
A blocked candidate does not replace the active release’s evidence.

From the server development environment the workflow checks Decompiler touch
paging at 320, 375 and 430px with Aster visible, then checks mount authorization
on the hosted Decompiler listener. Encounter defines the assertions. The
runtime drives Chromium over its debugging pipe and sends the mount requests
directly to loopback. The release plan uses the fixed AppDev ports and the
private hosted gateway configuration. Only the SHA-256 fingerprint of the
revoked credential is retained in the gate. The credential check rejects
reinstatement of that fingerprint, verifies refusal of an unapproved Basic
credential, and verifies the current credential works.

The signed-in Temple check holds Home's browser connection open and checks
that one **Opening Home…** screen stays visible until the staged Home desktop
and Start menu are ready.

The gate then runs the Front Gate and Service Manager browser suite against
the staged package and its runtime, followed by interaction Assurance in
Chromium. For a pinned Home package, Assurance checks that both bridge URLs
serve the same packaged modules and observes the countdown and desktop
activation exports running in Wasm. Set ENCOUNTER_VERIFY_BROWSER_WASM=1 when
qualifying a Wasm candidate so a missing Home catalog fails the gate. For
the staged workspace browser checks, also set ENCOUNTER_ENFORCE_BROWSER_CSP=1
to keep CSP enforced for Work, Temple, and Mobile. The check fails when the
candidate's served policy blocks Wasm. Work deployments also verify signed-in
Work. A failed check stops the command before preview or activation.
For a staged system package, run `verification/workspace-routes/verify.py`
with `--candidate PATH --frontend-csp-policy` to report the served policies
for the Home Front Gate bookmark, Temple's top-level startup documents,
the Home, Work, Platform, and Mobile frames, and the Mobile phone. The release
gate uses the candidate executable and its pinned standalone Wasm catalog to
check Live Events, Canvas, and Preview in loopback fixtures. The staging command
writes this catalog to `standalone-browser-wasm.rel` alongside the Home catalog.
The staged Pilot gateways verify the package's Preview, Live Events and
Canvas script receipts. The CSP preflight also checks the served Timesheet
preview, Co-build workbench and Co-build Canvas documents.
Coordinated system verification requires Home, Work, and standalone clients
to pin their browser Wasm catalogs together. It runs the preflight first for
those packages using the normal ingress policy. Run
`verify.py --candidate PATH --fixture-front-gate-csp` from the workspace-routes
verification directory for the approved loopback Home qualification. With CSP
enforced, Chromium checks the pinned Home bridge, Front Gate countdown,
Home startup and retry, and Aster startup. To run the countdown alongside
the wider CSP preflight, add `--fixture-home-wasm-csp`
to `--frontend-csp-policy`. The release gate then verifies the Front
Gate countdown, Work startup, Temple startup and reconnect, Mobile
Assurance, Mobile offline replay, and the standalone browser journeys with CSP enforced.
Pass `--frontend-previous-clients PATH` with `--frontend-wasm-journeys` to
rehearse standalone browser rollback using the executable from a distinct
retained package. Set `APPDEV_FRONTEND_PREVIOUS_CLIENTS` to the retained
package directory when running `check-system` to include this rehearsal in
the frontend release gate. If it has a standalone Wasm catalog, the verifier also
loads the retained Live Events, Canvas, and Preview bundles and checks their
served modules. The verifier checks the retained package and records its receipt.
For a coordinated loopback rollback, pass `--frontend-rollback-package PATH`
with `--front-gate-only`. Home, Work, and Aster reopen with the retained
package's runtimes. The verifier checks Aster's served interaction module and
requires the restored Aster scripts to match the candidate's original bytes.
Chromium opens the pinned Aster socket under the loopback Home CSP on the
retained release and after restoring the candidate. It also opens the Aster
socket with the canonical compatibility script under a policy that blocks
Wasm compilation before rollback, on the retained pinned release, and
after restoring the candidate.

`release/plan.rel` declares each command’s candidate, ordered gates, and final
action. `release/workflow.encounter` selects the route and checks that the
packages still match after verification. The native host runs the fixed gate
tools and enforces package immutability, the release lock, native admission,
and atomic activation.
For standard Home activation, install the Encounter runtime as the
root-owned executable `/usr/local/libexec/sourcery-appdev-activate-home`.

When staging the Temple startup proxy, render the `temple-startup` operation
from `front-gate-ingress/local-ingress.rel` with the full Temple startup
snippet as its second argument. Install the rendered snippet so the Front Gate
bookmark reaches Home directly.

```sh
app=projects/applications/appdev-projects
"$encounter" appdev-release "$app" check "$release"
"$encounter" appdev-release "$app" preview-rel "$preview_declaration"
"$encounter" appdev-release "$app" deploy "$installed_release"
```

When staging Home, render the Mobile Assurance catalogue from the staged Home
HTML. Run from `applications/appdev-projects` with an absolute release path.

```sh
mkdir -p "$release/browser-assets/assurance-catalogue"
catalogue="$release/browser-assets/assurance-catalogue/staged.html"
"$encounter" run --stdin ../.. applications/appdev-projects/release/assurance-catalogue.rel < "$release/index.html" > "$catalogue"
version=$(sha256sum "$catalogue" | cut -d' ' -f1)
mv "$catalogue" "$release/browser-assets/assurance-catalogue/$version.html"
descriptor="$release/browser-programme/applications/appdev-projects/assurance-catalogue-version.rel"
sed "s/\"scalar\", \"\"/\"scalar\", \"$version\"/" assurance-catalogue-version.rel > "$descriptor"
```

Pin the generated HTML and descriptor in `package-receipt.rel`. The release gate
verifies the descriptor, content digest, and both receipt pins. Mobile opens the
digest-named catalogue directly from the Encounter browser host. The browser can
reuse it across visits. Changed catalogue bytes get a new URL.
Mobile refreshes warnings and role-scoped decision history every 30 seconds
while Assurance is open. An unchanged list returns an empty response. An
update contains new or changed rows and their current order, so Mobile can
keep existing rows and remove rows that are no longer visible.

Copy `preview/example.rel` to the staging directory and set the package and
fixture paths relative to that declaration or use absolute paths. The
credentials directory supplies the fixture `identity-management-auth` file
and any certificate fixture credentials. Choose a direct fixture identity or
an Encounter identity gateway. Set `fixture.identityBroker` to
`synthetic-temple` to offer local steward and member sign-in, and supply
`port.identityBroker` and a steward address at `example.test`. The private
gateway REL configuration must point its broker and identity provider at that
listener and target the declared preview origin and workspace port.

For the Identity Management overview move, use a candidate package with the
projected links and set `("preview", "identityOverview", "/settings/identity/")`
with both identity fixtures. The loopback proxy redirects the exact old overview
GET to the new public URL. The gateway keeps its existing upstream and cookie
namespace. Ingress sends the overview finish redirect directly to the new
path and preserves the finish destination for named management requests.

The shared launcher runs the existing release gate before starting the host
operations in the order declared in `release/plan.rel`. The Encounter preview
programme validates fixture declarations and constructs the proxy and process
configuration.
It prints the loopback Home URL when ready and stops its processes and removes
its temporary state on Ctrl-C, termination, or a child failure. Certificate
fixtures declared by port are supplied by the caller.

Use `check-work` to test a staged Work package with the active Home.

```sh
"$encounter" appdev-release "$app" check-work "$work_release"
```

The command opens `/workspace/work` through Temple with a fixture sign-in
against the staged Work package. It holds Work's boot connection and verifies
that Temple shows **Opening Work…** while the Work frame stays hidden and
contains no legacy loading card. It then verifies that the desktop and Start
menu appear and Temple's loading screen closes. The command also runs the
existing AppDev gate against the active Home package.

Bundle Work in the system package before deployment. Run `check-system` on
that staged system and install the verified package under
`/srv/encounter-apps`. The `deploy-work` operation takes the installed Work
directory and uses the enclosing system's release-matched verification receipt,
activation, and rollback.
If deploying an older system package separately, rerun `check-system` on a
staged copy to bind it to the current verification suite.

```sh
"$encounter" appdev-release "$app" deploy-work "$installed_system/work"
```

Run the `check` operation on the finished staging directory before copying it to
`/srv/encounter-apps`. The interaction checks exercise the candidate browser
runtime and Home HTML with deterministic Front Gate readings and a controlled
clock. Desktop activation must dispatch zero host actions and change two
active-window markers on a switch and zero on repeat. Front Gate must dispatch
once when due or restored after a missed refresh, stay idle between refreshes
and while paused or minimized, and update only the timestamp or catalogue when
that part changes. Identical readings and filtered-out changes must produce zero
status or catalogue mutations.

The checks write `interaction-assurance.rel` with the observations and a SHA-256
fingerprint of the finished package. Include it when installing the package.
Build and finish all other files, including `package-receipt.rel`, before
verification. The gate verifies existing receipts for installed packages and
repeats the browser checks. To add a scenario, reuse the bridge and mutation
observers in `verification/assurance/` and add its required observation to the
native release admission contract.

Use `preview-rel` for previews and coordinated system deployment for runtime or
proxy rollouts. Run staging and verification as the development user.

The workspace host and `encounter appdev-browser-host RELEASE PORT` follow the
absolute release link. The standard deploy command atomically replaces
`/var/www/appdev-projects/workspace` under the Home release lock after the
checks pass. It expects a complete, root-owned package under
`/srv/encounter-apps` and a compatible native executable. The next workspace
request and new browser connection load and validate that target. HTML, CSS,
its CSP hash, the network projection, and the declared programmes come from
the same release.

Keep each release directory immutable. Publish corrections under a new directory
name. If a running host rejects a package at load time, it keeps the last valid
release active and logs the failure in the service journal. Pointing the link
back to a previous release rolls back through the same mechanism. A state-profile
change or a change to the browser streaming permission requires a runtime
installation.

Workspace sessions, acting roles, pairing rooms, pending operations, and locks
stay in the running workspace host. Existing browser connections finish on their
original programme. Refresh a tab to load the new HTML and browser programme.
Release changes must support requests from tabs that are still open.

To enable interaction Assurance on an existing installation, stage and verify a
candidate with the updated native runtime. Install the verified candidate and a
root-owned copy of the updated `encounter` at
`/usr/local/libexec/sourcery-appdev-release-gate`. Activate the verified release
and install both updated systemd units as part of the coordinated runtime
rollout. Both services validate the receipt before startup and again when they
load a different release. Use a release with a valid receipt as the rollback
target after enabling the gate.

Installing a changed native executable or first enabling release following
requires a service restart. Subsequent compatible application releases use the
link switch without a restart. The AppDev units use absolute release paths so
systemd's startup working directory cannot pin later loads to an older release.

## Claimipedia and Ask Aster

Author Claimipedia’s window behavior in `browser-notes.encounter`. It
declares the loading content, which dialog to close, the fragment request,
and the sign-in and error states. `browser.encounter` declares listener order
and batches registration. The Rust and JavaScript browser hosts provide the
shared listener and dialog ports used by those declarations.

Open **Claimipedia** or **Ask Aster** from the AppDev program list. Claimipedia
opens to Contents. Start with a featured article, browse by claim type, or
search the pinned v1.0.0 release. Each article keeps linked evidence and
related claims in view. The Claim index and Ecology map are also available.

Ask Aster searches the released Claimipedia corpus and the Game Hub catalogue.
A claim or evidence result opens the Claimipedia window with that record
selected. A Game Hub result opens its resource page.

Build or check the read-only programme from `projects/` with the native
Encounter executable and `applications/appdev-projects/claimipedia.rel`.
For a workspace release, stage the declaration and the modules and pinned REL
datasets it names under `claimipedia-programme/`, preserving their paths
relative to `projects/`.

## Manage versions

Right-click **Work** or open its **Actions** menu, then choose **Manage Versions**. The menu also opens the Hosted and SSH Preview environments.

App actions belong to the app entry. Notes-wide commands belong to the Notes
workspace. Context dialogs mount at the document root and use Encounter to
open at the pointer or the Actions button.
The program opens inside the Notes workspace and uses the existing Temple sign-in. It fingerprints the live
hosted and SSH preview page, stylesheet, and browser bridge. Use **Record local
version** to enter the build ID or commit from your computer.

**Submit for approval** records a pending proposal with the observed source and
destination versions. Review its release pin, destination access policy, and
rollback plan before applying it. The workspace service keeps reports and
proposals in its private systemd state directory.

Stage the native `encounter-core` executable as `encounter` beside the workspace
server. Under `version-programme/`, copy `versions.encounter`, `versions.rel`,
`network-publication.encounter`, `identity-management.encounter`,
`notes-office.encounter`, `x-mentions.encounter`, `pairing-service.encounter`,
`workspace.encounter`, and the declared shared HTML modules with their paths
relative to `projects/`.
The host supplies HTTP observations and persists the record selected by the
Encounter programme.

## Environments demo

Open **Environments demo** in Notes to switch between sample Home and Office
profiles, preview their QR codes, and simulate arriving at and leaving a work
event. Enable the app fast and travel lock to compare their effects across
both environments. QR codes open read-only recipient views with the same
sample fields shown in the sender’s preview. As Casey, request a temporary
unlock. Switch to Riley to approve it, then return to Casey and advance the
demo clock five minutes to see the work briefcase relock. The demo holds
sample state in the browser session until reset or exit.

## Acting as and steward handover

Open **Steward handover demo** from the AppDev list or use **Try the handover
demo** in Inspect identity. The same Acting as, Inspect identity and X Mentions
controls show sample data under a **Demo mode** banner. As Casey, grant Riley
five demo minutes of read-only X Mentions access and offer the handover. As
Jordan, review the handover preview and accept with Riley’s access carried
through to its original expiry or ended at handover. Switch among Casey,
Jordan and Riley to compare access and decision history. **Advance demo clock
5 minutes** expires an active grant. **Reset demo** lets you try the other
outcome. **Exit demo** returns to the live workspace.

Choose **Acting as…** on the Notes toolbar, or **Inspect identity** in the
program list. The existing Google-to-Temple sign-in establishes a verified
identity. The current Notes steward can switch between Personal and
Sourcery steward for that gateway session. The Notes gateway uses the
`appdev-office` identity admission mode. AppDev authorizes protected programs
against the current office record and selected role.

To transfer the office, act as Sourcery steward, enter the incoming
steward’s Google email, and choose **Offer steward handover**. Ask the
nominee to open Inspect identity using that platform-approved account and
accept within 24 hours. The preview shows any active X Mentions grant and its
expiry. The incoming steward can keep the grant until that deadline or end it
as part of acceptance. Acceptance transfers Notes steward authority, ends the
outgoing steward’s authority, and invalidates their pending X inbox setup
authorization. The X account and subscription continue with the Notes office.

Under **X Mentions delegation** in Inspect identity, the acting steward can
grant one recipient read-only access for 15 minutes, one hour, or 24 hours using
their verified Google email. The recipient signs into Notes using the existing
Google-to-Temple connection and can read and refresh X Mentions. Inspect
identity shows who granted access and when it expires. The steward can revoke
the grant. Decision history records grant, revocation, handover and expiry.
Expiry takes effect by the server clock and is recorded when Notes next
checks the grant.

The Notes office declaration owns delegation eligibility, durations, expiry,
handover choices, and decision receipts. It uses the pure `time.formatUtc`
port to format a calculated deadline. The native workspace supplies trusted
gateway identity, server time, and request data, and applies returned state
changes while holding the workspace lock.

The shared authorization gate has two layers. The native gateway boundary
verifies the internal credential, admits GET and POST, checks the trusted
origin for POST, and dispatches the program. The workspace admits Inspect
identity, Claimipedia, and Ask Aster for verified identities. Provider
settings, Manage versions, and Network require steward authority. X Mentions
requires steward authority for setup and also accepts the Encounter
declaration’s read-only decision for a delegated GET. Encounter revalidates
the steward’s role and term for pending operations. The host holds the
workspace lock and tracks in-flight operations.

Claimipedia uses the Encounter admission decision after the shared native
gateway and identity checks. Encounter admits verified GET requests and
refuses POST. The journal compares its decision with the former native rule
and records which decision controlled the request. To inspect the results,
run `journalctl -u appdev-workspace.service --grep 'Notes admission comparison'`.
Requests redirected by the public sign-in gateway end before this comparison.

The private appdev-workspace state directory holds notes-office.json, which
records the current term and decision receipts with the verified actor and
role at the time. APPDEV_STEWARD_EMAIL seeds the office from the prior
approved steward on first verified access. It has no effect after the
office record exists. Decisions predating the ledger have no actor receipt
in Notes.

## Identity Management

Open **Sourcery Operations → Identity Management** in AppDev, or follow the link
from **Acting as…** or the sign-in dialog. Identity Management opens in a
separate tab. The page shows the Temple-verified account, the current AppDev
role, and any X Mentions delegation visible to that account. **Roles, delegation
and decision history** opens the existing office controls. Temple owns the
identity and Google sign-in, and the existing gateway returns users to the page
after verification.

In the X Developer Console, configure a confidential OAuth 2.0 web app and
register this exact callback.

    https://appdev.sourcerytech.com.au/workspace/auth/x/callback

While acting as Sourcery steward, open **Social → Manage X sign-in settings**
from Identity Management. Expand **Social** on the settings page and enter the
X Client ID and client secret. Saving updates
Notes immediately. The steward can replace both credentials on the same page
and try sign-in to verify them. Notes keeps the credentials in a mode-0600 file
in its private systemd state directory. For installations provisioned with
APPDEV_X_CLIENT_ID and APPDEV_X_CLIENT_SECRET, those values remain the fallback
until the steward saves a pair. X identifies a user on the AppDev homepage.
Each launched app enforces its own access rules.

The public overview opens at `/settings/identity/`. The exact legacy overview
GET at `/identity-management/` redirects there. Named views, form actions, the
gateway namespace, and the identity callback on the Sourcery broker retain
their existing paths. The gateway and appdev-workspace.service use the same
private upstream credential. The workspace service receives it through
systemd LoadCredential.

### Public sign-in

The sign-in dialog lists the Sourcery Google account first. Personal Gmail and
Microsoft are under **Public accounts**, with X under **Social**. These
providers create an AppDev Home session. Temple continues to authorize
protected workspaces and steward actions.

- Create a separate Google OAuth web client with an external audience and
  register `https://appdev.sourcerytech.com.au/workspace/auth/gmail/callback`.
  AppDev accepts verified `@gmail.com` accounts on this route.
- Register a Microsoft Entra web app for personal Microsoft accounts and
  register `https://appdev.sourcerytech.com.au/workspace/auth/microsoft/callback`.
  AppDev uses Microsoft's `consumers` authority.

Store each registration's `clientId` and `clientSecret` in a root-readable
JSON credential file outside the release. Add the corresponding
`LoadCredential=` line to an `appdev-workspace.service` drop-in.

```ini
[Service]
LoadCredential=public-gmail-oauth:/etc/sourcery/appdev-public-gmail-oauth.json
LoadCredential=public-microsoft-oauth:/etc/sourcery/appdev-public-microsoft-oauth.json
```

Include the line for each provisioned provider. The workspace host loads the
credentials at startup, so apply the drop-in with the coordinated runtime
rollout. The dialog marks an unprovisioned provider unavailable.

### Semantic Compiler dry run

From the workspace root, run the local Encounter executable:

```sh
projects/encounter-core/target/release/encounter run --sources projects \
  applications/appdev-projects/identity-compiler.rel dry-run /settings/identity/
```

The read-only Encounter application scans route literals in AppDev and Encounter
runtime sources. Its pinned REL dataset assigns stable identities to the overview, provider view, and provider
submission. Encounter checks each declared reference against source, projects
the candidate links, and exercises the existing Workspace request process for
the old overview GET, the proposed GET, and adjacent requests. A bare path
contract either retains the management namespace or adds a separate canonical
overview branch while preserving existing management behavior. The projected
dialog checks keep dedicated handlers and modified clicks intact. The gateway
route is checked separately so its authenticated upstream GET stays on the
internal dispatch path without taking the public bookmark alias.

The qualified-path dataset groups named views and actions, Claimipedia links,
Aster operations, and gateway or OAuth continuations by what they do. Each
contract binds to a source occurrence and keeps its qualified path or namespace
outside the overview move. The report includes group counts, retained behavior,
and any uncovered source locations. The checks exercise Workspace dispatch and
verify that the alias leaves representative qualified paths, queries, and
anchors intact. Ingress, browser behavior, and references assembled outside the
scanned literals require separate verification. The dry run only writes the
report to standard output.

### Semantic Compiler in Home

Open **Apps → Semantic Compiler** beside Semantic Decompiler, or find it under
**Start → Workspace tools**. The Identity Management case shows stable identities
and source relationships in Facts, retained and split behavior in Contracts,
and source coverage and dry-run results in Coverage.

In **Dry run**, enter another overview path and run the checks. The simulation
uses the published source snapshot and the same Encounter route checks as the
CLI. It lists relationships and split contracts that follow the proposed
identity, preserves other management routes and the legacy alias, and flags
source literals tied to the current canonical path. The proposal stays in the
window and has no effect on routing.

The window reads a release snapshot. When the case changes, render it from
the workspace root with the same command followed by `rel`. Review the output
before replacing `identity-compiler-case.rel` and updating the dataset SHA-256
pin in `application.rel`.

## Certificates and Keys

Open **Home → Sourcery Operations → Identity and configuration**. Certificates
and Keys open in separate standard desktop windows with task buttons.
Certificates shows the managed Super CRM server and enrolled desktop
certificates, including each leaf and issuer expiry in UTC. Keys uses a
captioned table to show the SHA-256 fingerprints of the corresponding public
keys and their issuers' public keys. Both views use the existing Temple sign-in
and current Sourcery steward authority.

In Certificates, review a server or desktop renewal before approving it. An
eligible review is bound to the current steward session, the installed leaf and
issuer, and the proposed expiry. It expires after five minutes and approval
consumes it. Renewal keeps the existing key and issuer and caps validity at 30
days and the issuer's expiry. If the issuer cannot extend the leaf, the window
shows the Super CRM issuer rollover plan. Prepare separate replacement server
and device issuers, stage overlapping trust on the listener and enrolled
clients, then switch the server and re-enroll clients before retiring old trust.

Run the platform signer separately from the inventory reader. Configure
`APPDEV_CERTIFICATE_RENEWAL` with its loopback origin and give the signer and
workspace the same dedicated `certificate-renewal-auth` systemd credential.
The signer supports the managed server and desktop leaves and checks mutual
TLS against the managed listener before reporting success.
Use `encounter certificate-renewal` with the platform renewal programme and
its REL profiles. Encounter evaluates the review, digest, expiry limits,
certificate purpose, and listener acceptance. The native service uses the
OpenSSL libraries for signing and bounded mutual TLS. It replaces certificate
files atomically, validates nginx configuration, and signals the declared
systemd unit. After a failed reload it restores the files and checks that the
listener serves the previous certificate. Keep the managed keys in the
signer's private ingress directory.
The native Encounter workspace host handles steward authorization, one-use
reviews, and the audit receipt. The window and its browser bindings are
authored in typed Encounter.

Run the native platform reader with its Encounter programme, an absolute
credential directory and a dedicated loopback port. The REL profiles declare
the public certificate pairs. The reader validates each leaf against its issuer
and rereads the credentials on each request. Give the service account access
to the four public certificates through systemd credentials. The native
reader uses the system OpenSSL 3 library for X.509 inspection.

```sh
"$encounter" certificate-inventory \
  projects/encounter-platform/shared/certificate-inventory "$credentials_directory" "$inventory_port"
```

Set `APPDEV_CERTIFICATE_INVENTORY=http://127.0.0.1:<inventory_port>` on
`appdev-workspace.service`. Include the rebuilt workspace runtime and the
updated Home, browser, and version programmes in the checked Notes release.
The reader listens on loopback. The workspace host uses its protected identity
route for user access and shows an unavailable state if the reader is offline.

## X Mentions

Open **X Mentions** in the AppDev program list and sign in as the steward.
Use a fresh app-only Bearer Token from the X app configured in Identity
Management, select **Register webhook**, then **Authorize on X** with the
account whose mentions should be delivered. X bills delivered mention events.
The registration token and the OAuth user access token are used for setup
and held only in memory during their requests.

The HTTPS webhook is /workspace/webhooks/x. It responds to X verification
challenges and checks the OAuth 2.0 signature on the raw event bytes before
processing deliveries. The inbox admits explicit mentions for the authorized
account and keeps the latest 100 posts in the private AppDev state directory.
The **Disconnect X mentions** control asks the same X account to authorize
removal of its subscription. Messages already received stay in the inbox.

## Temple phone pairing

Open **Mobile → Connect to Temple** and select **Pair a phone**. Scan the
three-minute QR code with the phone, compare the code on both screens, and
approve the pairing on Mobile. The trip pairing lasts up to 24 hours.

## Native Windows connector

Build the Windows x64 executable from the Encounter platform directory.

    cargo build --manifest-path shared/temple-connector/Cargo.toml --locked --release --target x86_64-pc-windows-gnu

The GNU target requires its MinGW linker. Stage
`appdev-temple-connector.exe` as `AppDev-Temple-Connector.exe` in the workspace release.

In **Workspace → Help**, select **Install the Windows connector** and open
the download once. The executable copies itself into Local AppData
and registers the per-user Temple link. **Open SSH tunnels** then launches the
registered connector. The native version uses Windows HTTPS and the OpenSSH
client on PATH with your existing `aaron-dev` alias.

## Open SSH tunnels from Connect to Temple

Select **Open SSH tunnels** after installing the native connector. Use an
existing `aaron-dev` SSH alias with a trusted host key and key or agent
authentication. Keep the connector window open. It refreshes the published
ports and reconnects after a disconnect. Press Ctrl+C in that window to
stop its forwards. The Help menu also shows the OpenSSH command.

The `tunnels` record in `projects.encounter` supplies the homepage's versioned
port list, manual Help commands and shortcut URLs. Publish the rendered page
after changing the ports, together with the corresponding server listeners.
App ports behind Front Gate can change in its service registry without changing
the Front Gate forward. Work uses its own ingress for its embedded apps.

The shared Aster companion uses aster-browser/browser.rel. Its Encounter
programmes retain the installed kernel preference and panel behavior, with
streaming registered through browser.asterStream. Stage that declaration's
modules, including the shared browser-stream.encounter, under their paths
relative to projects/. Run its native browser host with
--allow-aster-stream. Replace the old static Aster JavaScript alias with
the platform proxy in aster-browser.nginx.conf. Each participating origin
also needs the scoped Aster event proxy. In a pinned Home package, run the
Aster browser host with the bundled Encounter executable and the package's
browser-assets directory. Home requests /_aster/browser.mjs?wasm=1, which
serves the pinned interaction module. Other Aster callers use the existing
unqualified URL. The package contains Encounter and REL source and static
presentation assets.

## Home: Sourcery Workspace

Home is branded **Sourcery OS**, including the Start menu. The launcher is
**Sourcery Workspace**. **Sourcery Operations** uses app cards grouped into
Quality and health, and Identity and configuration. Assurance, Performance,
Identity Management, Network Settings and Inspect identity each open their own
workspace window. Identity provider forms and network settings submissions stay
in that window; approved Temple sign-in still uses the gateway when needed.

Assurance includes the current launcher catalogue with each app's declared
purpose and launch destination, plus a checklist for semantic correctness and
consistency. Every entry starts **Not reviewed**. This is a review inventory,
not an automated semantic assessment or a recorded assurance result. The
existing role-scoped decision history remains available below the catalogue.

Front Gate displays and persists its auto-refresh countdown in the browser.
The browser dispatches the status check when the timer is due and Front Gate
is visible. Pause and minimize suppress automatic checks. Manual refresh
remains available while paused.

### Diagnose a slow Home launch

Open the window that feels slow, wait for its content, then return to
**Workspace → Operations → Performance** and refresh. Repeat the same launch
after closing it, then try it from the taskbar. Record which action you took.
The panel keeps the last 30 measured launches in the current Home document and
flags launches at or above 1,000 ms, HTTP 5xx responses, and browser or
dispatch failures. Use **Copy recent launches** for the table or **Copy launch details** for a selected trace before reloading.

- **Queue** covers the interval from the click to WebSocket dispatch. Compare a
  launch while Home is idle with one made while another Home action is loading.
- **Window** measures click to window reveal. **Total** measures click to
  dispatch completion, which can include follow-up work after the window opens.
- **Response** measures the browser wait for response headers. **Request**
  includes that wait plus reading and extracting the response content. Compare
  these with Total to see whether the wait was in the request or elsewhere in
  dispatch. Browser timing alone cannot split network transit from service time.
- Select a launch in **Recent launches** to inspect browser input delay and
  which preceding dispatches overlapped its queue wait. Desktop blockers include the action and window name. The ordered timeline
  marks the window reveal and shows the request and DOM updates after it.
  Compare browser execution time with the host round trip for each step.
  The round trip includes browser work and transport in both directions. The “Open and raise window” entry groups the shared opening operations into one exchange. It reports the number of active-window attribute writes. Pointer and focus activation stay in the browser.
- **Environment** samples server RAM and the workspace release filesystem at
  refresh time. The optional Encounter browser-host section shows process and
  connection counters. Capture readings during a reproduction when comparing
  resource pressure with launch latency.

For a link that navigates away from Home or opens another tab, capture the
destination's browser Network waterfall and Performance recording. In either
case, preserve the launch name, timing breakdown, outcome and Home build ID.
Releases must stage the browser bridge and the Encounter browser programme
together for these readings.

From the server workspace, run the automated sweep against a staged Home package:

```sh
source environment.sh
node projects/applications/appdev-projects/verification/sourcery-home/launch-sweep.mjs "$release"
```

The sweep discovers Home launchers and measures closed-window launches,
taskbar restores, and ordered pairs of open desktop windows at desktop and
phone widths. It retries a failed combination once after reloading the fixture
and records both attempts. The JSON report flags launches at or above 1,000 ms
and lists links that leave Home for separate destination testing. A loopback
fixture holds the session response during a launch and injects an HTTP 503 to
verify recovery. The sweep uses simulated session and application responses.

The Home release gate runs the fixture sweep before activation. The server’s
`sourcery-home-launch-sweep.timer` runs every 30 minutes. It checks the hosted
HTTPS page and browser connection with a controlled delay on the real session
request, then runs the full matrix against an isolated copy of the active
package. A failed check exits nonzero. Automated runs emit summary statistics
and up to three samples per category to the service journal. For a detailed
report, run the sweep without `--summary` and read its stdout.

The development launch sweep unit invokes
`encounter appdev-launch-sweep APP_ROOT` directly. Encounter selects the
probes, checks that the Work processes match the selected release, and computes
resource and warning reports. The driver bounds each probe and retries once if
the selected release or its receipt changes before reporting.

Before switching the installed sweep service units, stage and verify a release
driver that supports both `appdev-launch-sweep` and `appdev-capacity-sweep`.
The development units use the installed release driver path and the current
timer schedules. Roll back the driver, verification source and service
definitions together to their matching release.
The installed sweep services still call the two shell scripts, and the installed
Performance Mailbox still calls `dev-jobs/encounter-sweep-status.py`. The shell
scripts also use that Python entry point to read sweep history. Keep these
entry points until the installed service definitions have switched to Encounter.
The bundled Work probe uses a fixed positional marker understood by
both launchers during this transition.

The same timer runs the signed-in Work fixture with the running Encounter
browser package and the managed gateway policy. It enforces the Work budget at
100 and 200 ms and keeps both timing samples, summary statistics, and any
failure samples in the service journal.

The capacity sweep service definition in `dev-jobs/` invokes
`encounter appdev-capacity-sweep APP_ROOT` directly. The driver captures the
fixed browser fixture and its cgroup CPU and peak memory, then reads the
capacity journal. Encounter decides the five budget results and whether each
warning is awaiting confirmation, newly confirmed, or already active. The
driver emits the existing report and checkpoint records only while the
selected release and its package receipt still match.

The [Performance Mailbox](/workspace/platform/performance-mailbox) is under
**Platform → Performance Mailbox** for the signed-in Platform steward. It shows
the latest four measurements and one **WARNING: Performance Regression** per
sweep with measured budget breaches at 100 or 200 ms. Missing samples show as
unavailable. The mailbox renders the last 24 hours directly from the service
journal, without a separate report or mailbox archive. The unread count on
the Performance Mailbox card checks for new warnings every 30 seconds while
Platform is open. The badge lists the opening time and exchange count from the latest unread
warning for each affected app and delay, along with each budget overage and the sweep time in AWST with the elapsed time since that sweep. The badge marks a check Recovered when its latest measured sweep passes after
the regression. Opening the mailbox marks its current warnings read in
that browser. The read marker is a timestamp cookie.

The development Mailbox unit starts `encounter appdev-performance-mailbox`
on the existing private Unix socket. Encounter replays sweep confirmations,
selects unread warnings and recoveries, and computes badge updates. The driver
reads the bounded journal and invokes the existing Encounter renderer in
process. An open badge refreshes its opaque warning keys once when switching
between the old and new services. The read-marker cookie keeps its format.

Install `dev-jobs/sourcery-encounter-sweep-status.service` and include
`dev-jobs/performance-mailbox.nginx.conf` in the AppDev TLS server. The mailbox
and badge use the same access check as `/workspace/platform`. Render the
`launcher` argument of `dev-jobs/performance-mailbox.rel` with Encounter and
append the card after the Work items card in the workspace ingress. Include
`dev-jobs/performance-mailbox-platform.nginx.conf` inside the workspace proxy
location and install `dev-jobs/performance-mailbox-csp.nginx.conf` in the
nginx HTTP context to allow the badge frame on Platform.

The fixture gate also counts startup browser exchanges and holds the initial
session response until Home is ready. The gate allows up to two exchanges on
the regular Home path. The timer measures the full hosted Temple-to-Home path
with normal timing, with 25 ms, 100 ms and 200 ms added per browser exchange,
and with a delayed session response. Each exchange-delay test must open Home
in under one second.

```sh
systemctl status sourcery-home-launch-sweep.timer
journalctl -u sourcery-home-launch-sweep.service -n 20
```

Validate from `projects/` with `encounter check . applications/appdev-projects/application.rel`
and `encounter check --browser . applications/appdev-projects/browser.rel`.
Run the browser regression from the server workspace root:
`node projects/applications/appdev-projects/verification/sourcery-home/browser-test.mjs`.


## Platform workspace

Open **Start → Inbox** for incoming Platform Support requests. **Platform** in
Start or in the environment switch opens development work items. The steward
can move an inbox request to work items and track it as Ready, In progress, or
Done. The move preserves the support reference, original request, and any Aster
handoff. Semantic Decompiler opens through the existing Front Gate SSH tunnel
for source and trace inspection. The workspace is available under **Work**.

The shell and native Aster application must be staged together: the browser
requests the native inbox/work-items fragment and submits its forms in place.
See `aster-native/README.md` for image staging. With `environment.sh` sourced,
run `verification/platform-workflow/native-test.py` with Python and
`verification/platform-workflow/browser-test.mjs` with Node from this directory.
The native test uses synthetic identity and a disposable store. The browser test
renders the real shell, runs its Encounter programme, and uses fixture backend
responses to exercise navigation and forms.

## Temple-first startup preview

Stage the workspace runtime and version programme together. Include
workspace-temple-startup.nginx.conf at the server level alongside
workspace.nginx.conf to enable the chooser for direct browser visits to the
workspace routes. The wrapper keeps its Temple connection while switching
workspace views. The Mobile pairing invitation and offline phone view continue
through their existing routes.

Set APPDEV_TEMPLE_ID to the stable ID for the Temple served by this host.
The AppDev demo origin uses sourcerytech-demo by default. To accept a wrapper
hosted at a different origin, configure APPDEV_TEMPLE_CLIENT_ORIGIN on the
Temple server with that exact origin. The startup connection uses
/workspace/temple/connection and publishes the read-only
sourcery/temple-connection/1 greeting with the Temple ID and workspace
availability. Use HTTPS for hosted Temples and explicit loopback addresses
for local development.

Sourcery OS saves confirmed Temple origins and IDs under
sourcery.os.temples.v1 in local storage. Clear stored Temples removes that
record and closes the current connection. The first version of the record
starts with an empty list. Existing workspace preferences, notes, and
pairing records keep their own storage.

The wrapper initially hosts the existing workspace surfaces in frames.
Their application connections and sign-in flows continue to use their own
providers. Same-origin Work sign-in can open the gateway in a separate tab.
The Windows download installs the existing AppDev SSH connector. A
standalone Temple service comes from the operator or distribution that
supplies the chosen Temple.

## Sourcery OS system release

Formation's route inventory is generated from the Home catalogue and desktop
registries and Work's capability registry. It includes launch coordinates,
declared actions, custody and sign-in details where the app declares them.
Each exercise needs a visible app action and an observable outcome. An
inventory entry alone does not establish journey coverage.
The inventory's coverage relation maps each route to its exercises. An empty
exercise list identifies a route that still needs guidance. Open **Help → Formation
resources** in Home to find the Front Gate recovery, File Manager REL inspection,
and Store release exercises. The release gate follows the Help entry points
and exercises the underlying app actions with disposable fixtures.

The Home desktop guides also cover choosing and resetting a preview
typeface, checking the current Temple role in Steward, reading managed
certificate expiry and public key fingerprints, and opening Store from
Game Zone. The desktop journey uses disposable Temple sessions and the
AppDev read-only public inventory provider. Temple Manager opens the signed-in
Memory note and Field visit Journal entry, with buttons for their existing
editors. Returning from an editor reloads the records. Use **Refresh** for
changes made on another device. Signed-out users can open Temple sign-in in a
new tab and then refresh. The gate edits Memory from Temple Manager, verifies both records
through Work and Mobile, then reopens them in Temple Manager after restarting
the workspace host. A second account sees its own empty records.

In Home Apps, **Environments** opens the Workspaces menu. A signed-in user can
save Home, Work, or Mobile as their default. **Steward handover** opens the
Steward window, where the current steward can make an offer and the verified
recipient can review and accept it. The gate saves a real environment
preference, transfers a disposable Temple office, restarts the workspace host,
and reopens the saved preference and the acceptance receipt for both accounts.
The previous practice bookmarks still open their sample scenarios.

In Work, open **Formation resources** from the environment bar. The Work
guides take you through live Performance samples, a retained Semantic
Decompiler document, and reopening a Super CRM case with its saved activity.
Work Start opens the same signed-in CRM and Decompiler routes listed in Home.
The system journey uses a disposable CRM store and restarts the real CRM host
before checking the saved update. The Decompiler read uses the existing
read-only mount.

The paired Temple guides cover Mailbox, Receiving Temple, Today and
Assurance in enrolled managed Work. The gate signs in to two independent
Temple hosts built from the package, sends and accepts an appointment, and
reopens the confirmed appointment in both stores after restart. Today and
Assurance use the same named coordinator projections as managed Work.
Hosted AppDev Work's appointment practice views still use their session
simulation. Open enrolled managed Work for the signed exchange.

Game Hub opens from Work Start. Its Formation guides follow Recent Folio into
One World's shipment controls, check a full-size Design References image,
and exercise the One World clock, Asset Foundry draft, and Landscape Foundry
journal. The release gate runs the pinned hosted Game Hub image against a
disposable store, then restarts it and checks the same simulation tick,
asset draft and terrain revision. Use a world or project you are allowed to
edit when following the write exercises.

The signed-in Home guides also cover creating and reopening a North River
project, following a released Claimipedia claim to its linked evidence, and
refreshing X Inbox after checking the connected account in X Mentions. The
gate uses the pinned North River image with a disposable project store and
sends a signed test delivery to a disposable workspace inbox. The checks
reuse the packaged Claimipedia corpus and leave its evidence unchanged.
Ask Aster adds a Claimipedia-scoped conversation from Home Apps and reopens
the same conversation after the native host restarts. The gate uses the
identity gateway and a disposable Aster store. The conversation test
exercises creation and ownership without sending a message to a model.

The portfolio preview guides open through the existing Front Gate SSH
tunnel. They cover Foundry, Industrial Systems Optimizer, Super CRM
appointments, Timesheet, Tradie, Outcome Value Navigator, Relationship
Navigator, World, and Sourcery Desktop. The system gate checks the published
preview URLs and opens Timesheet from its guide. It also compiles the current
portfolio sources with the shared renderers and runs the retained Encounter
suite against those pinned images and disposable stores. Preview content and
accounts on AppDev are left in place.

The platform preview guides also open Workgarden, Harborboard, Game Hub,
Model Evaluation, and Semantic Decompiler through Front Gate. The system
gate reads the actual preview pages, checks the retained evaluation receipt,
and pages the retained Decompiler replies. Harborboard's write exercise
uses a disposable board and checks the saved epic and dependency after the
host restarts.

The Claimipedia Native Pilot and Surface Preview guides search the released
corpus through Front Gate and reopen the same claim revision in both
interfaces. Surface Preview also opens the atlas dependency view and the
knowledge ecology's typed relationships. The gate checks the published
record and its revision history through both actual preview routes.
The editorial guide follows a private draft through exact-revision review and
curator staging. The gate checks the protected launch and runs the workflow
against the pinned native image with disposable reviewer and curator
identities. It restarts the host and verifies the staged candidate and
existing released revision are both still available.

The Usewords guide creates a matter from a real issue and reopens its name
and description in the same browser. Usewords uses local personas and saves
the record in that browser profile. The gate uses a fresh profile and the
staged Front Gate ingress, with ordinary preview requests still served
through the installed Front Gate directory.

Work Start opens Sourcery Desktop, Worldwright Unified, Usewords, and
Harborboard through the existing Front Gate tunnel. Formation includes the
same guides in Home and Work. The gate opens all four Work shortcuts,
reads the Sourcery Desktop REL export, and checks that Worldwright remembers
both visited places and Usewords reopens the same matter from the browser
profile used in Home. Harborboard's saved changes are exercised in the
disposable board described above.

Context Hub reopens a frozen audit episode, including its corpus, policy,
and admitted-state pins and the retained baseline and adaptive comparison.
Worldbox reads the current world fingerprint and reopens the metadata of a
retained checkpoint. The checks leave both shared previews intact. Encounter
Authoring uses the same pinned image as the preview with a disposable store.
Review leaves the accepted revision unchanged, acceptance advances it once,
and the host reopens the intent and decision receipt after a restart.
Creator Studio previews a document title as a draft, saves an accepted
version and replays that version from browser-local storage. The system
journey checks the installed preview through Front Gate and records how
long acceptance takes.

Publication guides use the existing preview versions of the personal website,
The Missing Middle, The Field, Perth Encounter, Church on Air, and Worldwright
Platform. The gate follows the published links, reloads the same document,
changes the Field's synthetic scenario and period, and steps through the
retained broadcast cut. These checks exercise what the previews publish
without submitting forms or changing the published material.

From the server development workspace, source `environment.sh` and render
`applications/appdev-projects/formation/inventory.rel` with
`encounter run --declaration projects`. The inventory checks that the
Workgarden exercise still points to the actual Home shortcut and uses the
actions declared by Work. The Workgarden browser test follows Formation to the
hosted route, creates and completes a work item, restarts the app host, and
reopens the item from Work’s Start menu. This is a signed-in journey through
the packaged Work gateway with a disposable Workgarden store. Existing Field
visit drafts remain available from Getting started.

### Open Shop

Open **Shop** from Home's Apps catalogue or Work's Start menu. After
Temple sign-in, choose an item and quantity and select **Request order**.
Find the order under **Your orders**. Open **Order history** to review its
progress. You can cancel a pending request. Shop uses a separate catalogue
from Store and currently records order requests without taking payment.

An operator uses **Publish an item** to create a catalogue listing. Open
**Orders** to accept or decline a request. After completing an accepted
order, choose **Mark fulfilled**. The operator queue shows the verified
customer email when the request came through Temple. Customers see their
own orders.

AppDev binds Shop's `shop-access` dataset from the private Shop host REL
configuration. Add one `operatorPrincipal` fact for each approved Temple
principal ID. An empty list admits signed-in customers only. Keep the
gateway's upstream credential private and bind the app and gateway to
loopback. Load `shop/appdev.nginx.conf` on the AppDev origin and
`shop/broker.nginx.conf` on the identity broker origin. They forward to
the same Shop gateway. Preserve the Shop state directory across upgrades
and rollback.

### Check one staged system package

The package root has the standard Home layout, including its executable and
`package-receipt.rel`. Put the complete Work release under `work/`, the Shop
declarations and modules under `shop/source/`, and both Shop ingress
snippets under `shop/`. Compile the Shop application to `shop/shop.rel`
with the bundled runtime. Make the image readable by the service and pin it
in the root package receipt. Stage the platform Workgarden declaration and its
modules, including shared HTML algebra, under `workgarden/source/`. Compile
`workgarden/board.rel` with the Encounter executable carried by the package,
make the image readable by the Workgarden service user, and record its SHA-256
in the root package receipt. Stage the Home
workspace, Temple startup, Aster and
rate-limit ingress snippets under `proxy/`. Include the Front Gate ingress
declaration and programme under `front-gate-ingress/`. Include the activation
programme, REL declaration and Shop units under `release/`. Stage the paired Temple
declaration and its module closure under `temple/programme/` and render the
`window`, `stylesheet`, `operator`, and `operator-rejected` modes of
`life-board-prototype/pilot/shell.rel` under `temple/assets/`. Stage the Aster
native declarations and modules under `aster/source/`, the fixture seed encoder
under `aster/seed/` and the identity gateway declaration under
`aster/identity-policy/`. The native staging operation takes its seed from
outside the package. Generate the release
receipt after staging the products, Formation inventory and
`formation/records.nginx.conf`.

Run `sourcery-appdev-deploy check VERIFICATION_ROOT PACKAGE` with the AppDev
verification source matched to that release. The host-installed driver calls
`appdev-release VERIFICATION_ROOT check-system PACKAGE` and records the source
path and a digest of its release plan, preview modules, verification files,
and native Chromium profile
in the package's Interaction Assurance receipt. Keep that source available
and unchanged through promotion. The REL
plan runs the existing Home, Work, interaction assurance, Decompiler paging
and revoked credential checks. It also runs the signed-in Formation,
Workgarden and Shop journeys against those staged sources and ingress snippets, with
disposable state and Temple identities. The gate fingerprints the complete
directory before and after verification. Stage `release/performance.rel` as
`performance-policy.rel` at the package root before generating the release
receipt. The staged browser probes supply measurements to
`verification/performance/measurements.rel`. The release driver evaluates
the Encounter verdict against the pinned registry in the bound verification
suite. The system plan requires the registry performance gate after Interaction
Assurance and before the driver can publish the receipt. The driver supervises
the fixed startup and idle, Assurance bytes, and badge bytes fixture commands
with time and output limits. The gate measures desktop and phone-width Home launches, checks
Work startup at 100 and 200 ms simulated bridge latency, and collects three
independent Shop and Formation journey samples. It records the
sample counts, percentiles, maxima and budgets in `interaction-assurance.rel`,
bound to the package fingerprint. Encounter publishes this receipt after all
gates pass and native package admission succeeds. A Home-only check can
verify a system package's existing receipt. The Home-only deployment
command refuses a system package, which needs coordinated activation.
These budgets measure disposable browser
fixtures, including Work reopen and Mobile offline receipt. Live latency and
the rest of the catalogue require separate evidence. `check-system` only
verifies the candidate.

The required App Build gate uses a fresh hosted HTTPS fixture and three
disposable Temple identities. It builds North River through the API, manual
browser flow, and guided replay. Each isolated app starts empty, accepts an
employee submission and a manager approval, and retains both the approved
request and its exact activation receipt across a workspace restart. Fresh
Temple sessions reopen all three apps. Run the focused check with `verification/workspace-routes/verify.py --candidate PACKAGE --app-build`.

### Move a Formation draft to your account

In Getting started, open **My first note** or **Field visit** while signed in.
Open **Browser draft**, then choose **Import browser draft**. You can reopen
the imported record under the same account on another device. The import
keeps the browser copy and never replaces an existing signed-in record.
If both versions exist, open the browser draft to review and copy text
into the signed-in editor. Work shortcut preferences remain in the browser.

In Mobile, pair the phone, select the saved records and send the trip.
On the phone, wait for **Trip saved**, go offline and reload. Reconnect
after the offline check passes. The desktop displays **Ready** after it
receives the phone's confirmation for that trip version.

Run the workspace route verifier with `--formation` to exercise the import,
signed-in reopen, phone confirmation, write isolation and native host
restart against a disposable release. The workspace service stores each
account's records in a private `formation-<principal hash>.rel` file under
its persistent state directory. Preserve that directory through promotion
and rollback. An older release can still open the original browser draft.
The signed-in records become available again when the new package is restored.

`deploy-system` runs the Encounter check declared in
`verification/sourcery-home/live-formation.rel` after activation. The check
uses the native Chromium host and a one-use grant valid for at most five
minutes. It writes distinct Memory and Journal entries through the editors,
reopens both in a fresh page, and revokes the session.
The test identity uses the separate `formation-test-records.rel` store.
Each run replaces only the runner's previous test entries. The operator
needs non-interactive sudo for the root-owned
`/usr/local/libexec/sourcery-appdev-test-grant` helper, installed from the
Encounter executable. The helper writes only the grant digest and expiry to
the private workspace state directory.

From the server development workspace, rerun the check on the active
release with the same lock used by deployment:

```sh
source environment.sh
sourcery-appdev-deploy check-live VERIFICATION_ROOT
```

### Rehearse rollback and restoration

For coordinated activation, install the package's `release/activation.rel` and
`release/activation.encounter` as root-owned files under
`/etc/sourcery/appdev-system`. Install the matching release runtime as
`/usr/local/libexec/sourcery-appdev-activate-system`. The runtime loads both
activation plans and the readiness decision before switching the active link.
Configure Work and
Workgarden with the launchers below. The Shop service names are
`appdev-shop.service` and `appdev-shop-gateway.service`. Install their
unit files from `release/`. Place the private configuration under
`/etc/sourcery/appdev-shop` in a root-owned mode `0700` directory. Give the
service account read access to its REL files at mode `0400`. The systemd units
mount the required files read-only inside each service. Set the host configuration's
`operators` path to `/run/sourcery-appdev-shop/operators.rel` and Shop's store to
`/var/lib/sourcery-appdev-shop`, the state directory created by systemd.
Install the
version-selected ingress on both hosts before using the activation command.
The AppDev vhost includes `workspace/shop/appdev.nginx.con[f]` and
`workspace/formation/records.nginx.con[f]` relative to
`/var/www/appdev-projects`. The broker vhost includes
`workspace/shop/broker.nginx.con[f]` from the same root. Use absolute include
paths. The glob permits a standalone release with no system snippets.
Install `release/upstreams.nginx.conf` as an HTTP-level include for both
vhosts. The package's `formation/records.nginx.conf` supplies the dedicated
`/workspace/formation/records` location. Keep the live workspace, Work and
Front Gate proxy includes alongside these locations.

Run `sourcery-appdev-deploy deploy INSTALLED_PACKAGE` to select the verified
suite from the package's receipt, rerun the full system gate, and activate
that exact installed package. The driver checks the suite digest before the
gate and again before activation. Recheck a staged copy if the suite moved,
changed, or predates verification binding.

The `/usr/local/bin/sourcery-appdev-deploy` entry point links directly to the
Encounter executable at `/usr/local/libexec/sourcery-appdev-release-driver`.
Update that operator driver independently of the runtime in a system package.
System activation holds the Home release lock while it checks the baseline,
admits the artifact changes through the installed lifecycle policy, changes
the shared link, and checks the selected services and workspace routes.
Unknown changes require lifecycle review before activation. If activation
or readiness fails, the coordinator restores the previous link and
reconciles the selected actions it attempted. Native loopback probes verify the Home, Work, Formation
and Shop ingress responses over TLS using the host CA bundle and the declared
ingress hostname. The Front Gate probe checks the exact readiness body over
loopback HTTP. Encounter admits the results for the selected release. The live
Temple Manager check then locks the selected release while it runs. A failure in this check returns a
deployment error and leaves the activated release available for diagnosis.
Front Gate live status is verified separately through the user-facing route
after promotion.

Configure the network controller's `gateRuntime` to use a stable copy of the
system runtime with the previous Front Gate programme in the adjacent
`front-gate-ingress/` directory. Set `APPDEV_FRONT_GATE_ACTIVE_RELEASE` to
`/var/www/appdev-projects/workspace` in the existing network service. The host
loads the selected system package's admitted ingress and uses the adjacent
programme when the selected release is standalone Home. The Usewords browser
route reads its loopback port from the active directory. Coordinated activation
restarts the local proxy on the existing SSH forwarding port and probes
`/front-gate/ready` with the dedicated readiness host. The browser keeps
using the existing status route over the tunnel.

For an explicit rollback, use the installed helper's
`appdev-activate-system PREVIOUS_PACKAGE CURRENT_PACKAGE` operation with
the current canonical link target as the baseline. Keep both immutable
packages and their assurance receipts.

The Work browser can start from the shared active release link. In its
systemd override, use the installed Encounter activation driver as the
service's `ExecStart`:

```text
/usr/local/libexec/sourcery-appdev-activate-system appdev-work-host /var/www/appdev-projects/workspace LEGACY_WORK 24252
```

Replace `LEGACY_WORK` with the canonical
path of the standalone Work release active before the first system rollout.
Replace the old version-specific working directory and pre-start package
check in the same override. The launcher checks the selected Work package
and starts its own runtime. It resolves the release link once per service
start, so a coordinated switch must restart the Work browser after changing
the link. The legacy path is used when the active release is standalone
Home. An incomplete system release fails startup.

Use the same installed Encounter executable for the Work gateway override:

```text
/usr/local/libexec/sourcery-appdev-activate-system appdev-work-gateway /var/www/appdev-projects/workspace PRIVATE_CONFIG --standalone-policy STANDALONE_GATEWAY_POLICY
```

Set `PRIVATE_CONFIG` to the existing absolute private gateway REL path. Keep
its permissions, working directory, credentials, broker, ports, stylesheet
and mounts. For a rollback to standalone Home, install the standalone Work
gateway's `gateway.rel` and its Encounter modules in a canonical root-owned
directory under `/srv/encounter-apps` and pass that directory as
`STANDALONE_GATEWAY_POLICY`. Deployments between system releases can omit the
flag and its argument. The same native gateway serves both release types.
For a system release, it loads `work/gateway-programme/gateway.rel` from
the active package. Restart the Work gateway alongside the Work browser
during promotion and rollback.

The bundled policy retains the existing Workgarden, Super CRM and Decompiler
mounts. The system gate checks signed-in Super CRM reads and posts, the
Decompiler evaluation and verification routes, and method refusals before
the request reaches an upstream.

The Shop app and gateway use the same active release link:

```text
encounter appdev-shop-host /var/www/appdev-projects/workspace PRIVATE_SHOP_CONFIG
encounter appdev-shop-gateway /var/www/appdev-projects/workspace PRIVATE_GATEWAY_CONFIG
```

The private Shop configuration has subject `shop`, contract
`encounter/appdev-shop/1`, an absolute `store` directory, a loopback
`port`, an absolute `operators` path for the gateway's upstream credential
check, and the approved `operatorPrincipal` values. The gateway reads
its normal private `encounter/gateway/1` configuration with prefix
`/shop` and identity admission `appdev-shop`. Keep both private files,
the credential, and the order store across release switches. The service
launchers select the image and gateway policy from the system release.
Stop the Shop services when rolling back to standalone Home.

Use loopback port `24463` for the Shop image and `24464` for the Shop
gateway. Set the gateway target origin to the AppDev HTTPS origin and use
the existing Sourcery identity broker and identity service. The Shop
programme supplies its CSS, so use an empty stylesheet file for the
gateway's generic stylesheet field.

Workgarden uses the same release link and keeps the existing durable store:

```text
/usr/local/libexec/sourcery-appdev-activate-system appdev-workgarden /var/www/appdev-projects/workspace HOST_CONFIG
```

The host REL configuration has subject `workgarden` and properties
`contract` (`encounter/appdev-workgarden/1`), `store` (the existing
absolute state directory), `port` (the existing loopback port),
`legacyRuntime`, `legacyImage`, and `legacySha256` (the previous
executable, image, and its pin). Keep the service environment and
credentials. Restart Workgarden with the Work gateway after changing the
active release. The rehearsal restarts Workgarden at both switches and
checks the same item from the common store. It opens the existing
`/life-board/workgarden/` bookmark on standalone Work and uses the Work
Start menu after restoring the system release.

With the candidate and previous system package both assured, run
`verification/workspace-routes/verify.py --candidate PACKAGE --system-journeys
--rollback-package PREVIOUS` under the server browser profile, with
`APPDEV_RELEASE_RUNTIME` set to the Encounter executable providing
`appdev-work-host`, `appdev-work-gateway`, `appdev-workgarden`, and
`appdev-decompiler-check`. The fixture first
creates Formation records and a fulfilled Shop order in the candidate. It
switches Home, Work and Shop to the previous package, then restores the candidate
over the same disposable stores. Each switch checks the Home build, boots Work
through its packaged gateway, reopens the records and checks the same Shop order
ID and history. It also saves an edit under the previous package and verifies
that the restored candidate reopens that edit. It changes a disposable
active release link and checks which Work executable starts after each
switch. It keeps the fixture's private gateway configuration in place.

For the first rollout, pass the previous standalone Home via
`--rollback-package` and the previous standalone Work via
`--rollback-work-package`. Set `APPDEV_LEGACY_WORK_GATEWAY_POLICY` to the
policy directory used by the active standalone gateway. Set
`APPDEV_LEGACY_WORKGARDEN_RUNTIME` and
`APPDEV_LEGACY_WORKGARDEN_IMAGE` to the active standalone Workgarden executable
and image. The rehearsal opens that image against disposable state.
In the disposable proxy, this reloads both ingress
hosts without the new Shop routes and removes the dedicated Formation records
location. It stops Shop, boots the previous Home and Work packages, and checks
that Shop and Formation records are unavailable in that version. Restoring the
candidate reloads the new routes and verifies the original account records and
order history. This exercises the previous product packages with a modeled
legacy ingress on loopback. The live proxy cutover and post-promotion Front Gate
SSH check remain part of the actual deployment.

The system release still needs the remaining catalogue journeys and live
performance evidence.

### Registry Demo approval presentation reload

VM Manager can follow an operator-owned absolute symlink named by
`APPDEV_REGISTRY_APPROVAL_RELEASE`. Each immutable target contains
`registry-approval-view.encounter`, `registry-approval-style.encounter`, and
`presentation.rel`. The REL receipt declares
`("presentation", "contract", "encounter/registry-approval-presentation/1")`
and one `("artifact", "<file>", "<sha256>")` fact for each module. Both modules
run through the Encounter renderer in the VM Manager bootstrap. Their outputs
are published together after checking the contract and digests. Publish and
roll back by atomically replacing the symlink with an admitted generation.
Keep the current and prior generation available for rollback. A rejected
candidate leaves the current presentation in service and appears in the VM
Manager journal. The preset presentation is bundled when the symlink is
absent from the launch configuration.

The report-only policy in `release/lifecycle.rel` takes two admitted component
inventories and the existing `system` selection. Each component supplies an
`id`, `kind`, `digest`, `interface`, `stateProfile`, `grants` and `imports`.
Imports name a component and its expected interface. Run the declaration with
`encounter run --declaration APPDEV_RELEASE_SOURCE lifecycle.rel REPORT_INPUT`,
where `APPDEV_RELEASE_SOURCE` is the directory containing the policy and
`REPORT_INPUT` is a JSON argument with `current`, `candidate`, and `system`.
The report includes the existing restart actions for comparison. It has no
service-control capability.

### Gateway reload and release impact

The Workspace sign-in authority and Workspace app consumers can use
`APPDEV_WORKSPACE_SIGN_IN_RELEASE` to follow an operator-owned presentation
generation. The generation contains `workspace_sign_in.encounter` and
`presentation.rel` with the contract
`encounter/workspace-sign-in-presentation/1` and the module's SHA-256.
Admission renders both screens and checks their return navigation. The session
authority retains its session and pending callback state in the host.

The canonical Nginx sign-in prompt goes to the independent Encounter
renderer in `release/appdev-workspace-sign-in.service`. The renderer
accepts the return path on loopback. Nginx sends no session cookie or
authorization header to it. The identity gateway still issues and
validates all sign-ins. Live AppDev routes the exact callback through
`workspace-completion.nginx.conf` and
`release/appdev-workspace-completion.service` while its existing identity
binary remains loaded. The bridge forwards the callback once. On the exact
bundled completion response it renders the validated continuation over the
protected socket and preserves the authority's response headers and
cookies. Unrecognized responses and an unavailable renderer use the
authority's original response. The `workspace-sign-in` module target
publishes both screens in one generation without replacing either host.

The bridge is needed for the currently running identity binary. After the
authority can use the protected socket directly, restore the original
callback upstream and remove the bridge. Both systemd units read
`/etc/sourcery/appdev-workspace-completion.env`. Set
`APPDEV_COMPLETION_BRIDGE_UID` and `APPDEV_WORKSPACE_COMPLETION_UID` to
the installed bridge and renderer account UIDs.

The bridge executable is a transport dependency in
`release/system-lifecycle/workspace-completion-bootstrap.inventory.rel`.
For a binary replacement, verify a second loopback listener and switch
only the callback ingress to it with a graceful Nginx reload. Replace
the original listener once its callback connections drain. Switch back
after readiness and drain the temporary listener before stopping it.
The bridge journal records `rendered` or `authority-fallback` for a
recognized completion without logging the return path or credentials.

The completion renderer can be exercised in staging with
`encounter workspace-sign-in-presentation PORT SOCKET AUTHORITY_UID`.
The authority opts in with `APPDEV_WORKSPACE_COMPLETION_SOCKET` and
`APPDEV_WORKSPACE_COMPLETION_UID`. The protected Unix socket verifies both
peer identities. The only request payload is the validated return path.
The identity gateway issues the session cookie and applies the response
headers. If the renderer is unavailable, the identity gateway uses its
own admitted presentation. If neither renderer can respond, it sends
the session cookie with a redirect to the validated destination.

A Workspace app gateway can follow its own `APPDEV_GATEWAY_POLICY_RELEASE`.
Each target contains the gateway's existing declaration at the same relative
path and the Encounter and REL files used by its module. The
`gateway-policy.rel` receipt declares a `release.contract` of
`encounter/appdev-gateway-policy/1`, the configured `release.prefix`, and
an `artifact` digest for every file in the generation. The bootstrap checks
that the new policy keeps the state profile, exported entries, and grants.
It retains launch configuration, credentials, and listener state. An
existing WebSocket retains its transport policy and continues to recheck
Workspace access. Publish and roll back by replacing the pointer atomically.

`encounter appdev-release-impact POLICY_ROOT INVENTORY_REL CURRENT CANDIDATE`
computes a report from both release directories without changing them.
`INVENTORY_REL` declares an `inventory.contract` of
`encounter/appdev-component-inventory/1` and each `inventory.component`.
Use component facts for `kind`, `interface`, `stateProfile`, optional
`grant` and `import` values, and its exact `artifact` paths or slash-ending
`tree` prefixes. Declare imports as `component:interface`. The report
fingerprints the releases, lists changed artifacts and includes the existing
activation actions. A changed file with no owner requires review.

The system activation driver can run this report under the release lock before
changing the active link. Enable the preflight by staging the lifecycle policy
and a reviewed `lifecycle-inventory.rel` in the system activation policy
directory. In report-only mode the output explains the proposed actions while
the existing activation policy still controls service changes.

For Registry approval and the Game Hub, Store, Work, Shop and North River
AppDev gateways, the native module driver evaluates the policy before
publishing the release pointer.
The root-owned policy directory `/etc/sourcery/appdev-module-policy` contains
`activation.encounter`, `lifecycle.encounter`, `lifecycle.rel` and the
applicable inventories from `release/module-activation`.

Run `/usr/local/libexec/sourcery-appdev-module-driver appdev-module-activation plan TARGET CURRENT CANDIDATE` first.
The report compares the full module generations and checks both against the
boundary's declared contract. `TARGET` is `registry-approval`, `game-policy`, `store-policy`, `work-policy`,
`shop-policy`, or `north-river-policy`. `CURRENT` and `CANDIDATE` are immutable direct children of the
target's installed module directory. Then run the same command using
`publish` to apply an admitted plan. The publisher accepts exactly one
verified reload for the named boundary, holds the target's lock, and restores
the previous pointer if the running service fails to acknowledge or pass
readiness. Use the same command with the generations reversed for rollback.

An import can use `component:interface;reload`, `;drain`, or `;replace` to
declare what the consumer must do when a compatible provider's artifact
digest changes. The default is to keep the consumer running. A missing or
incompatible interface requires review regardless of the requested action.


North River's AppDev ingress and File Viewer provider use the AppDev-only
gateway. The preview listener serves the separate preview audience on its
existing process. A North River AppDev policy publication changes only the
AppDev gateway's selected generation.

### Coordinated release lifecycle

Preview an installed candidate with
`encounter appdev-system-activation-plan POLICY_ROOT PREVIOUS CANDIDATE`.
The report compares the full AppDev artifact trees, lists the existing
restart groups, and resolves each changed component through
`lifecycle-bindings.rel`. The report names the host actions separately
from services expected to follow the release pointer. Unclassified files,
unbound actions, and incompatible receipt edits require review.

The installed `sourcery-appdev-deploy deploy INSTALLED_PACKAGE` uses this
policy after its assurance gate. The installed inventory covers release
guide edits, the two declared Workspace programme artifacts, and the
Formation records ingress include. Workspace, the browser host, and
File Viewer acknowledge programme updates in their existing processes.
A Formation ingress change validates Nginx and waits for the same master
to start a new accepting worker generation. The previous workers can
finish serving their existing connections.

A privileged operator can run the activation stage directly with
`/usr/local/libexec/sourcery-appdev-coordinated-driver appdev-activate-system-lifecycle CANDIDATE PREVIOUS`.
Both packages need matching assurance receipts. Use the same command with
the release arguments reversed for a planned rollback. For an explicitly reviewed
maintenance change with the legacy restart plan, run
`/usr/local/libexec/sourcery-appdev-activate-system-legacy appdev-activate-system CANDIDATE PREVIOUS`.
The installed activation launcher dispatches only the system activation
operation to the coordinator. Existing Work and Shop startup commands
still use the original service launcher behind that stable path.
