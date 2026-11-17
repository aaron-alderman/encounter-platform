# Encounter Front Gate

## Loader declarations

`directory.loader.encounter` and `pilot.loader.encounter` own the module
selections, entry points and effect grants. The runtime loads the generated
`directory.rel` and `pilot.rel` at their existing paths.

From the Encounter platform checkout, regenerate the projections with the
shared compiler. The Pilot declaration resolves modules from the workspace
`projects` directory. Use `--check` with the same paths to verify them.

```sh
node shared/node/loader-declarations.cjs --write applications/front-gate/directory.rel applications/front-gate/pilot.rel
```

The platform projection check includes both declarations.

## HTTPS pilot

Open [North River Front Gate](https://appdev.sourcerytech.com.au/encounter-pilot/)
to go to Project home and sign in with the Google account granted pilot access. The live task uses a
disposable Encounter store and streams run events over WebSockets. **Open
read-only preview** opens the native Timesheet on
[`dev.appdev.sourcerytech.com.au`](https://dev.appdev.sourcerytech.com.au/encounter-pilot/timesheet-preview/timesheet)
as a demo employee. The workspace header links back to the editor, and the
approval receipt remains available from the preview. Scenario mounts add
links to other published scenarios, steps, and the corresponding editor
review.

The pilot gateway delegates Google login to the existing Sourcery identity
service. It verifies the hosted session and issues a one-use handoff bound to
the requesting browser and destination. Both destinations use host-only cookies.
The gateway keeps the app operator credentials server-side and checks the hosted
session on each app request and periodically during a WebSocket subscription.

The HTTPS pilot runs with `encounter gateway /path/to/private/gateway.rel`.
`pilot.encounter` defines route policy and the workspace and preview views.
The Encounter host adapter handles the loopback connections and session
exchange. From the development workspace root, run the route and view checks with
`encounter test --declaration projects encounter-platform/applications/front-gate/pilot.rel`.

The Pilot gateway declares `gateway.styles` for its own chrome. It serves
`chrome.css` separately and forwards the application stylesheets byte for
byte. North River and Co-build declare `ui.presentationStyles` for their
native pages. Staged scenario images continue to serve their recorded
application presentation.

On aaron-dev, the transient `encounter-https-pilot-{gateway,live,preview}.service`
user units listen on loopback ports 24230–24232. Nginx routes only the pilot paths
to the gateway. Keep its configuration, operator credentials, and disposable
stores in the private pilot state directory.

The Node transport and Pilot browser test harnesses live in
`test/front-gate/` at the platform root. Run the transport test with
`ENCOUNTER_RUST_HOST=/path/to/encounter node --test test/front-gate/directory.transport.mjs`.

## SSH directory

Front Gate is the private entry point for the Encounter platform on aaron-dev.
Open **Home → Workspace → Apps → Front Gate** in Sourcery OS for app links,
live TCP listener status, and running system and user service units. Use
**Refresh status** for an immediate check or choose an auto-refresh interval.
During a tunnel interruption, Front Gate marks the last successful reading
as stale and shows when it was checked.

## Open the directory

Run one SSH forward from your computer, then open
[the Front Gate bookmark](http://localhost:24220/). It redirects to Sourcery OS
Home and opens the native Front Gate window. Allow local network access if the
browser prompts for it.

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:24220:127.0.0.1:24220 aaron-dev
```

Every app link uses that same port. For example, Encounter Authoring opens at
`http://encounter.localhost:24220/`. Separate hostnames keep app cookies and
browser storage isolated. The gateway passes requests to the existing app
servers, which retain their login rules and server-side stores. Existing
browser sessions and browser-only data remain at the original app addresses.
An app may prompt you to sign in at its Front Gate address. To access
browser-only data saved before Front Gate, open the original address using its
original forward and use the app's export or import tools where available.

## Run on the server

From the Encounter platform checkout, with the native Encounter executable on
your path:

```sh
encounter directory applications/front-gate directory.rel 24220
```

The directory host binds to loopback. Pass port `0` for a disposable listener
and read its address from stdout. On aaron-dev the managed network service
starts the directory host behind the existing Front Gate forward.

Edit `services.encounter` to register an app's hostname and existing loopback
port. Reload the managed gateway to load registry changes. The proxy routes only
those registered hostnames. Services without browser routes appear in the host
service list. `directory.encounter` produces the versioned status response from
current listener, service unit, timer, and execution observations. The proxy
serves it as a read-only GET at `/front-gate/status-data` to AppDev Home.
