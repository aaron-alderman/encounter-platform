# Sourcery Home application boundaries

- Use `encounter appdev-release APP_ROOT` for AppDev Home previews and deployments. Pass the staged
  package to the regression gate before starting a preview or switching the
  active release.
- Use `sourcery-appdev-deploy check VERIFICATION_ROOT STAGED_SYSTEM` to bind the
  system package to its release-matched verification suite. Promote the verified
  package with `sourcery-appdev-deploy deploy INSTALLED_SYSTEM`. The host-installed
  driver runs the live Temple Manager check after activation.
- Use the `preview-rel` operation for new Home previews. Declare the package,
  ports and fixtures in REL and use the shared launcher for process cleanup.
- Use `check-work` to verify a staged Work package against the active Home.
  For deployment, verify the system package with `check-system` and pass its
  installed `work/` directory to `deploy-work`. Work follows coordinated
  system activation and rollback.

- An Operations app with its own flow must use the desktop launch contract in
  `desktop-launch.encounter`. Declare its launch action, independent desktop
  window, and task. Reopening it focuses or restores that window.
- Keep Home settings dialogs limited to the shell controls registered in
  `desktop.admitOperation`. An app's place in the Operations menu does not
  grant it access to the Home dialog surface.
- Author app UI and behavior in Encounter, with REL declarations and data.
  Use typed Encounter UI and the shared presentation and browser ports.
  Keep authored HTML, CSS, and JavaScript out of the app programme source
  directories. Stage generated browser output as assets.
- Native capability providers belong to the platform. An application may use
  a provider through its declared, scoped interface.
- Render app catalogue cards through the platform `appCard.compose` component.
  Declare a default action and launch destination on each app. Supply only
  alternate actions as menu items. The shared component decides whether the
  three-dot control is needed, and Home admission checks the rendered cards.
