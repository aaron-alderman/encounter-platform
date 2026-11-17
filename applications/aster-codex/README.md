# Aster Codex

Open **Aster Codex** from Sourcery OS Home Apps, Start → Apps, or the desktop.
The standard Document window opens maximized in the OS desktop. Its regular
title bar can restore, minimize, or close it, and the taskbar restores the
minimized reader. A direct bookmark to https://appdev.sourcerytech.com.au/aster-codex/
still opens the reader. The existing AppDev owner sign-in protects either entry.

The Encounter runtime reads the bound aaron-dev Codex account in
/home/ubuntu/.codex. SQLite is opened read-only. Chat records stay where
Codex writes them. The shared Document manager layout shows the searchable
chat list on the left and the selected transcript on the right. The desktop panes scroll independently. On a phone, the chat list and
conversation each fill the reader. The Chats button restores the active
search or archive page at the selected row. Refresh a chat to
see newly saved messages. Latest transcript pages open at the newest
saved message. Display subjects use at most 36 characters in the index
and 68 in the reading header. The full subject remains available on hover.

## Chats and the composer

The chat list groups recent threads by Perth local date. Today and
Yesterday start open. Older groups are collapsed until opened. The search
icon reveals title search. Pins are stored in the reader's own service
state directory and appear above the date groups.

The composer sends to the selected, non-archived Desktop chat through its
already-running app server. A submission is tied to an owner-checked chat
and a single-use form ticket. Send and Stop share the composer area.
Stop appears only when Desktop reports a matching active turn.

A pulsing green Running badge means Desktop reports an active turn.
A blue Finished · unread badge means a completed turn arrived after the
owner last opened that chat's latest transcript. Unread replies lists
active chats with unseen completions, including those outside the
current page or search. An unread entry remains if another turn starts
in the same chat. Opening the latest transcript acknowledges its
completed replies and clears its entry. The first list load establishes
the seen baseline. Status is recalculated when the list page is rendered.

## Live status and output

Connection and turn state appear beside the chat title. The indicator
refreshes every five seconds. Open Live output in the transcript to see
reply deltas.

The selected chat's live pane observes the existing Codex Desktop App
Server through its Unix control socket. It checks that the thread belongs
to the configured chat account and subscribes to threads that Desktop
already has loaded. The pane shows the runtime state and new reply text.
The saved transcript remains readable when the live socket is unavailable.
Each feed is bounded to four minutes and has a reconnect link.

The Stop form requires the account's existing owner sign-in, the AppDev
origin, and the exact active thread and turn. The reader checks again with
Desktop before issuing interruption. “Stop requested” acknowledges the
request. Desktop supplies the terminal status. No separate Codex instance
is started to watch or stop a turn.

The server unit overrides its private temporary-directory mount for the
single Desktop socket directory using 20-desktop-codex.conf. The HTTPS
ingress keeps live streaming unbuffered. Send, Stop, and pin changes use
owner-gated POST routes with same-origin form checks.

Chat pages seek backward through bounded byte windows in the rollout and
ignore incomplete writes at the end. A page carries at most 25 visible
entries. Display of each message is capped at 192 KiB and a saved event
larger than the 8 MiB scan window may be skipped. The older-message cursor
continues across the unread part of a large transcript. Tool internals and
private reasoning are omitted.

## Saved message formatting

Saved messages render Markdown using the shared Sourcery data-table widget
for pipe tables. Links show the destination on mouse hover or keyboard
focus. On a touch screen, Address opens the full destination. The native
link also supports the browser's usual link menu. Live output streams text
as it arrives. Refresh the transcript to see it formatted after delivery.

## Saved images and previews

Saved raster attachments are read on demand, using a chat identifier plus
the position of the matching recorded event and attachment. The reader
checks the account, media roots, regular-file type, signature, and size
before delivery. Saved visualization HTML referenced by a chat can be
downloaded. AppDev does not execute that HTML under its origin.

A captured loopback URL always remains visible. To give an existing private
Sourcery preview a link, have the operator verify that the same preview is
served at an owner-protected Sourcery URL. Add the exact recorded URL to
the previews object in /etc/aster-codex/config.json, with a same-origin
destination path as its value, then restart aster-codex.service. The
reader never makes an outbound request for a URL found in a chat.

## Operation and verification

Run python3 verify-owner-gate.py on aaron-dev to exercise the installed
auth subrequest in an isolated Nginx with a Game Hub fixture at session
capacity. The check requires a successful owner request and rejects both
an anonymous request and a non-owner session before either reaches the
reader. Run verify-badges.py with the staged Encounter binary to check
the first-load baseline, running state, completed state and acknowledgement.

Before activating a reader release, run assurance/verify-send.py with the
staged Encounter binary. Set QA_NODE_PACKAGE and QA_CHROMIUM to the
workspace Playwright package and Chromium executable. The fixture runs
an isolated HTTPS origin with a disposable Desktop socket and chat. It
submits the browser form inside an iframe, verifies exactly one delivery,
and confirms an invalid Origin remains blocked with an in-frame error.

The source lives in the adjacent encounter-core checkout under
src/aster_codex.encounter and src/aster_codex.rs. The Home launch and window
are declared in the AppDev Encounter registry and use the common document
slots and controls. The reader links to the shared Sourcery OS theme emitted
by the Home programme. Encounter emits the Markdown presentation and uses\nthe shared table styles and colour tokens.

The service loads a versioned release under /srv/encounter-apps/aster-codex,
selected by its current symlink. The loopback listener expects the
root-provisioned ingress credential. Nginx injects it only after the
existing owner gate and drops browser headers before passing the request
to the reader.

Build from encounter-core on aaron-dev using the workspace's
env/temple3-linux-toolchain/environment.sh, a workspace-owned TMPDIR,
and cargo build --offline --release --locked. Run verify-reader.py with
the scratch directory and candidate binary as arguments. It runs a
separate fixture runtime and the 320-pixel Chromium checks. The shared
Home Build badge is validated for both windows in the Home admission check.

The Aster Codex service and ingress declarations are kept here. The AppDev
TLS ingress restricts Home's added frame permission to /aster-codex/. The
reader admits only same-origin embedding. Its CSS URL serves the emitted
Home theme from the active Home package.

When staging Home, run Encounter with the AppDev release/shared-style.rel
declaration and the rendered Home document on stdin. Publish the emitted
theme as browser-assets/sourcery-os.css. Run release/compact-style.rel to
emit browser-assets/temple-compact.css for the 44-pixel connected mobile
bar. Pin both files with the package assets. Keep App Build's inline theme
in sync with the rendered Home stylesheet because its browser style policy
uses the Home stylesheet hash. Regenerate Home's Assurance catalogue and
Catalogue source excerpts through the regular release workflow. Use the
coordinated AppDev release gate and activation command for Home changes.

For reader rollback, repoint current atomically to a previous verified
reader release and restart aster-codex.service. Restore its matching Nginx
configuration and Home package when rolling back the desktop integration.
