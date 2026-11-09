# Encounter portfolio previews

Each product has its own manifest and fresh SQLite store. The core workflows
run through the shared Encounter host.

| Preview port | App | Manifest directory | Workflow |
| --- | --- | --- | --- |
| 24201 | Foundry Mine to Port | `foundry-mine-to-port` | Seeded capacity scenarios, bottlenecks and completion timeline |
| 24202 | Industrial Systems Optimizer | `industrial-systems-optimizer` | Finite build sequence comparison on a worked scenario with declared assumptions |
| 24203 | Super CRM | `super-crm` | Customer accounts, delivery cases, and case activity |
| 24204 | Timesheet | `timesheet` | Time entry, correction, submission, and local approval totals |
| 24205 | Tradie | `tradie` | Enquiry intake, claim, escalation, and completion history |
| 24206 | Outcome Value Navigator | `outcome-value-navigator` | Hypotheses, source-linked evidence, trial proposals, and reported value |
| 24207 | Relationship Navigator | `relationship-navigator` | Separate participant accounts, shared offers, pause and mutual return |
| 24208 | World | `world` | Legacy material-development baseline and four counterfactuals over up to 40 epochs |
| 24209 | Sourcery Desktop | `sourcery-desktop` | Browser workspace for claims, evidence, revisions, withdrawal and copyable REL export |

To launch one locally from the Encounter root, substitute its port and directory:

```powershell
$env:ENCOUNTER_PORT = '24201'
node bootstrap/server.cjs .local/foundry-mine-to-port products/foundry-mine-to-port/application.rel
```

For the server previews, keep this SSH command running from Windows:

```powershell
ssh -N -o ExitOnForwardFailure=yes `
  -L 24201:127.0.0.1:24201 `
  -L 24202:127.0.0.1:24202 `
  -L 24203:127.0.0.1:24203 `
  -L 24204:127.0.0.1:24204 `
  -L 24205:127.0.0.1:24205 `
  -L 24206:127.0.0.1:24206 `
  -L 24207:127.0.0.1:24207 `
  -L 24208:127.0.0.1:24208 `
  -L 24209:127.0.0.1:24209 aaron-dev
```

Open `http://127.0.0.1:<port>` with a port from the table.

The optimizer uses illustrative assumptions and the Foundry model has no
empirical calibration. Timesheet approval is local workflow state. Relationship
Navigator uses separate access codes within the private preview. The Sourcery
Desktop entry is the browser claim workspace. The legacy Windows installer,
MCP integration, and signed Temple-to-Temple synchronization remain outside
that preview's scope.

World's `source/products/world/development.rel` retains the baseline inputs,
requirements, action effects and four counterfactuals from the old
`world/agent-simulation.source.json` with its source SHA-256. Encounter owns
the replay and derives the outcomes and gaps.
