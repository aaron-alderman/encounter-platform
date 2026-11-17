# Live platform connection: pending capability

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
