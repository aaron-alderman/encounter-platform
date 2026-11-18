# Live platform connection: pending capability

## Hosted AppDev pilot

The private `/usewords/` route is served by the AI collaboration pilot.
The browser edition and the external Temple worker described below retain
their separate execution and persistence boundaries.

- Sign in through Sourcery Workspace and select **Usewords** under **Apps**.
- The pilot opens one shared matter. Both participants can propose issues,
  positions, or options. A participant reviews the other person's proposal
  before its exact revision can be applied.
- **Draft suggestions with AI** sends the accepted shared matter to the
  configured local Ollama model through the existing Usewords brief and
  response checks. Only the requester sees the draft until they propose a
  suggestion. Proposed items still go through independent review.
- The receiver verifies identity on every request and rechecks it before
  writes. SQLite commits the receipt and retry record together. A stale
  form is shown the current matter. The hosted board has the existing
  Usewords limits of twelve proposals and forty-eight events.

The source closure needs `applications/usewords-lightning/`,
`applications/encounter-libraries/`, and the pilot source in the same
release checkout. Set the pilot's private `usewords` configuration to
an absolute `adapter` path to `platform/hosted.cjs`, a separate absolute
SQLite `database` path, and a `model` object with `model` and `digest`.
Use the existing workspace observer and two-member allowlist. Preserve
the participant binding and the compiled policy when re-opening an
existing matter. Keep configuration and both databases outside Git.

Proxy the exact `/usewords/` and `/usewords/style.css` routes on AppDev
to the existing private listener, forwarding cookies and origin. Allow
at least 120 seconds for the matter response. Page markup and styles
are generated from `hosted.encounter` with the existing Usewords
renderers.

For the Home launcher, use an Nginx auth subrequest to the transport route
`/_appdev-private-usewords`. Keep this route internal and forward the
workspace cookie. Only a member response carries `X-Usewords-Visible: yes`.
For that response, replace the existing Home Usewords preview link
`http://usewords.localhost:24220/` with `/usewords/` and show **Usewords**
as the card title. Other workspace sessions keep their normal catalogue.
Keep the personalized Home response private and uncached.

### Import the former collaboration pilot

Stop the transport and make a consistent backup of the Usewords store.
From the new source checkout run `node platform/import-pilot.cjs` with
the absolute path to the private configuration as its only argument.
The configuration must still refer to the previous Usewords adapter and
the original pilot store. The import checks the prior binding, preserves
all pilot dates and attribution, and records the context and new binding
in one transaction. When no collaboration events exist and the imported
material fits the matter description, it also becomes the recorded
starting context for AI. Existing reviewed boards keep their receipts and
display the import alongside them.

Point the private adapter setting to the new `platform/hosted.cjs`, install
the new pilot transport, and start the service. The original pilot database
is a private archive. The old bookmark redirects signed-in members to
Usewords, and new work enters through the shared Usewords matter.

From this directory, run `node --test platform/hosted.test.cjs` with Node
24. Set `USEWORDS_TEST_MODEL` to an installed local model tag to exercise
the real AI draft and proposal path. The test uses synthetic identities
and a disposable matter database.

## Temple worker connection

The requested live connection is **not active**. The existing Usewords workspace remains local. The connected Temple worker `sqlite-sourcery-mcp-live-interaction-v5` exposes a fixed captured Claimipedia read surface with application admission false. Its development lanes are not product workspaces or browser-facing application persistence. No application generation was activated, Site deployed, hostname attached or DNS changed.

`live-observation.json` records the actual connected host/catalogue and sanitized Site observations. The named development lane was opened for inspection and closed with its head unchanged; it does not hold a copy of the Usewords workspace.

## Prepared implementation

`service.encounter` implements `wp.prepare` through the retained process algebra. It is an inactive service-policy candidate, separate from the current browser runtime and acceptance identity. Tests compile, link, lower and execute it with the existing evaluator/compiler. They do not install it in Temple or prove a persistence effect.

The candidate prepares three commands:

- **save-draft** validates the source document and preserves the accepted pointer.
- **accept** replays an exact receipt before preparing its accepted source.
- **publish** replays the current accepted receipt, selects one journey and emits only its computed entry trees. Later draft edits and other journeys are excluded.

Every command binds owner, workspace, expected head, operation ID, request hash and value hash. Missing identity, another owner's record, stale head, changed acceptance, missing journey and invalid receipts refuse. The trusted context must come from the receiver, never client input. Prepared commands explicitly report `applicationAdmission: false`; they grant no write authority.

`receiver-contract.json` defines the proposed routes and required receiver effects. The atomic transaction, session/CSRF checks, idempotency ledger, restart durability, global slug ownership, private/public route isolation and deployment binding remain unimplemented on the connected platform. They cannot be established by a passing pure-policy test or by a browser receipt.

## Required live implementation

The next source owner must supply a real Temple/Sourcery application receiver with authenticated transaction authority for `app.usewords`, together with its supported endpoint and exact source/runtime binding. The currently connected surface supplies neither. An application endpoint for another platform installation would also need its authority and source alignment inspected before use.

Once that receiver exists:

1. Install and qualify this policy with the receiver's exact runtime. Pin the accepted application's runtime separately from the platform policy; old receipts cannot silently change meaning.
2. Implement the contract through admitted transaction and publication adapters. Prove rollback, restart durability, stale concurrent writes, cross-owner denial, slug collision and uncertain-request reconciliation on the actual receiver.
3. Connect the Usewords controls through authored processes and the admitted transport mechanism. Keep credentials server-side. Confirm persistence by reopening from a second browser/session.
4. Publish the selected accepted artifact and verify that public routes cannot read authoring records or controls. Authoring remains authenticated even when journey pages are public.
5. Deploy and attach `usewords.ai` only after the server boundary works. The existing owner-private Site is `appgprj_6aedeedb7bd88191baf640255db56cc9`; preserve that workspace boundary when creating public journey delivery. DNS/TLS validation remains a real deployment check.

No substitute browser storage, development-lane file, mocked database or Sites D1 database is represented as live Temple persistence.

## Checks

```sh
npm test -- platform
```

These checks are same-author process-policy evidence. They cover deterministic preparation, exact acceptance replay/tampering, identity/scope/head refusals, accepted-only public projection and preservation of the accepted pointer while saving drafts. The current browser runtime sources and receipt identity are unchanged by this inactive candidate.

## Two-party receiver candidate

`parties.encounter#pr.prepare` now prepares authenticated party-scoped reads and writes, private preparation saves, shared collaboration commands and packets. `party-receiver-contract.json` declares the required receiver effects, identity binding, atomic transaction and qualification evidence. `party-live-observation.json` records the fresh connected catalogue inspection: it still supplies no Usewords application write/session receiver.

The candidate compiles and executes alongside the application processes in `tests/platform.encounter`. The tests cover trusted identity derivation, spoofed actors, missing session/CSRF, membership, cross-party slots, stale heads, scoped payload exclusion and idempotent reconciliation. They supply trusted fixtures and have no storage/identity effect. They do not prove an authenticated two-session interaction, real cross-party confidentiality, atomic rollback or restart persistence. The browser exposes a clearly labelled local simulation of the preparation/disclosure/acceptance protocol while this boundary is unavailable. No deployment or activation was performed.
