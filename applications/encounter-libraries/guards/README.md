# Encounter guards

The version directories contain the canonical Encounter source and its SHA-256
manifest. Release 1.0.0 captures the existing dependency, occurrence and review
guards. The consuming applications keep exact copies under their declared
`source/` paths, so source checkouts and compiled images remain self-contained.

| Consumer | Guard modules |
| --- | --- |
| Authoring | Dependency, occurrence |
| Harborboard | Dependency |
| Super CRM | Occurrence, review |
| Claimipedia | Review |

Each application pins the library version and the hashes of its selected
modules in `guards.sha256` next to its application declaration. Use the
native Encounter Core driver from the workspace root. Supply the runtime
version and the SHA-256 from its trusted build when using a separate compiler:

```sh
"$ENCOUNTER_CORE" build-guarded-image projects harborboard 0.1.7 \
  "$PLATFORM_COMPILER" /path/to/harborboard.rel "$PLATFORM_SHA256"
```

The application names are `authoring`, `harborboard`, `super-crm` and
`claimipedia`. The command checks the release manifest, declared guard paths,
pin and source bytes before compilation. It checks the captured declaration
and guard bytes again in the compiler output before publishing the image and
printing its SHA-256. Both native Linux packagers share this policy.

To check source pins without building:

```sh
"$ENCOUNTER_CORE" check-guard-pins projects
```

Pass an application name to check one consumer.

## Promote a guard version

Prepare all three modules in a candidate directory outside this library and
generate its manifest with `sha256sum *-guard.encounter > SHA256SUMS` from
that directory. In a compiler REL file, declare the absolute `binary`, reported
`version`, and trusted build `sha256` for the `authoring`, `platform`, and
`claimipedia` roles.

```text
("authoring", "binary", "/path/to/encounter")
("authoring", "version", "0.1.15")
("authoring", "sha256", "trusted-build-sha256")
```

Run the promotion gate from the workspace root.

```sh
"$ENCOUNTER_CORE" promote-guards projects VERSION /path/to/candidate /path/to/compilers.rel
```

The gate snapshots each executable and checks its trusted build SHA-256 before
launching it. Encounter orders the qualification and uses the apps' current
pins as the rollback baseline. The gate qualifies
the candidate in disposable source copies and stores, upgrades one app at
a time, checks both mixed-version Linux packages, forces a failed upgrade
for each app, and rebuilds byte-identical rollback images. It publishes the
qualified candidate to a new version directory only after all checks pass.
Keep the command output as the release record. Existing version directories
are immutable.

After promotion, adopt the version independently in each app by copying
its selected files and updating its pin. Run that app's Node and native
compatibility checks before promoting its pin. Deploy its compiled image
through its existing release and cutover process.
