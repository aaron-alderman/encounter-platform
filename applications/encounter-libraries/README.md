# Encounter application libraries

Creator Studio and Usewords Lightning select these modules through their
application declarations. Source presentation and journeys keep their original
logical paths. Workflows link under `source/shared/`. The selected frontends
compile the shared bytes and the runtime measures them in each application's
source identity. The apps have separate release declarations, grants, and data.

- `source-presentation/source-algebra.encounter` provides source inspection
  and presentation. It retains the Worldwright source and its original terms.
- `journeys/` pairs the Encounter programme with the corresponding REL facts
  and contracts. Keep the three files together.
- `workflows/` holds shared workspace, party work and matter management
  processes. Browser storage calls, application boot and the public local-agent
  entries live in each app. The shared UI processes use the consuming app's
  declared browser grants and its own dispatch state.
- `assurance/application-boundary.encounter` checks shared process ownership,
  the consuming app's reviewed grant list, its local workspace and preparation
  storage owners, and refusal of foreign runtime preparations and observer edits.
- `assurance/child-execution.encounter` verifies that an unprepared model and
  a copy of a prepared model are both refused, and that the prepared model
  still renders the journey.
- `assurance/library-integrity.encounter` pins the qualified shared source and
  checks that the journey runtime uses the measured bytes.

Run `npm test` in each consuming application after changing a shared module.
Review the source difference before updating the qualified hashes. Source
identity changes produce a new receipt basis. The browser and Node hosts
recognize prepared child objects by identity within each loaded runtime.
Serialized child models must be prepared again from source.

[Encounter guards](guards/README.md) contains the versioned dependency,
occurrence and review guards for Authoring, Harborboard, Super CRM and
Claimipedia.

### Code and command inputs

Load `/workspace/sourcery-os/code-input.css` in the Encounter document and
set `"data-input-kind" = "code"` or `"data-input-kind" = "command"` on the
relevant input or textarea. For example, a command can use
`{ tag = "input"; attrs = { id = "command"; name = "command"; "data-input-kind" = "command" } }`.
Leave the attribute off regular text fields. The shared rule sets only
the font family and preserves the control’s size, line height, and label.

To publish the asset, run native Encounter from `projects/`.

```sh
encounter run --declaration . applications/encounter-libraries/build/code-input-styles.rel > code-input.css
```
