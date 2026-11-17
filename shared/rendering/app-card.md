# Encounter app cards

Import `app-card.encounter` in the consumer’s Encounter declaration.
`appCard.compose` accepts an app ID, display name, explicit `defaultAction`,
typed launch node and optional typed alternate items. Put the same action
name on the launch node as `data-launch-action`. A default link needs an
`href`. A default button needs `type="button"` and an `aria-controls`
destination. The component refuses a missing or mismatched default.

Render the returned card in the catalogue. Include `appCard.styles` and mount
any returned menu at document level for the platform popover port. The
three-dot button is a sibling of the launch control inside the card, and
the button and menu use the accessible name `<App name> actions`. The
menu starts with a copy of the declared default and then lists the
alternates. An empty alternate list returns no menu and no trigger.

For a description, supply its full text and mark the visible summary with
`app-card-summary` inside the launch node. Include the shared styles and
bind the scoped `browser.appDescriptions` port to the catalogue root.
The summary shows up to three lines. The ellipsis at the end of clipped
text is a button. Hover or activate it to show the full description.

Home invokes `appCard.admitRows` on the rendered catalogue in both HTML assets
when it admits a release. The check requires the shared card wrapper and an
explicit default action and destination on each primary control.
