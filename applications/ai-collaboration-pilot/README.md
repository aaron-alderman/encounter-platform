# Working together with AI

This private pilot serves `/ai-collaboration/` on the AppDev site. It uses
the existing Sourcery Google workspace session, a SQLite conversation store,
and a local Ollama model. Members can share contributions, questions,
decisions, and reflections. Either member can request a synthesis of
recent shared entries.

## Redeploy an existing installation

Run these commands as the service account on the Linux host, from the root
of a checkout of the intended Encounter Platform revision. The existing
installation uses Node 24 and the following directory and unit.

```sh
set -eu
app="$HOME/.local/share/sourcery-ai-collaboration"
unit=sourcery-ai-collaboration-pilot.service
source=applications/ai-collaboration-pilot/server.mjs
test -f "$app/config.json"
test -f "$app/server.mjs"
node --check "$source"
node --check applications/ai-collaboration-pilot/workspace-link.js
install -m 0600 "$app/server.mjs" "$app/server.mjs.previous"
install -m 0600 applications/ai-collaboration-pilot/workspace-link.js "$app/workspace-link.js"
install -m 0600 "$source" "$app/server.mjs.next"
mv -f "$app/server.mjs.next" "$app/server.mjs"
systemctl --user restart "$unit"
systemctl --user is-active "$unit"
curl -sS -i https://appdev.sourcerytech.com.au/ai-collaboration/
```

The signed-out HTTPS request should return HTTP 404 with the plain body
`Not found` and `Cache-Control: private, no-store`. Then sign in through
the Sourcery workspace and open the pilot as an authorized member.
The **Working together with AI** card should appear in Home under **Apps**.
Verify the contributions are still present and request a synthesis with
approved test content when checking AI. An authenticated nonmember should
receive the same generic 404 as a signed-out visitor. Check service errors
with `journalctl --user -u sourcery-ai-collaboration-pilot.service -n 40`.

To roll back the code, install `server.mjs.previous` as `server.mjs` in the
deployment directory and restart the same unit. Take a consistent SQLite
backup before deploying any future revision that changes the database
schema.

## Provision a fresh installation

1. Set up a private directory outside the checkout with mode `0700`.
   Install `server.mjs` and `workspace-link.js` with mode `0600`. Create a mode-`0600`
   `config.json` there using the deployment's private configuration.
2. Set `origin` to the exact public HTTPS origin, `port` to an unused
   loopback port, and `database` to an absolute SQLite path in the private
   directory. Set `identityPort` and `identityAuthorization` from the
   authorized AppDev workspace session observer configuration. The
   observer must serve `/identity-management/app-session` and identify
   the user from their workspace session. Set `members` to a JSON object
   mapping authorized Google sign-in emails to display names. Set
   `model` to an installed model on Ollama at `127.0.0.1:11434`.
3. Install a systemd user unit with `WorkingDirectory` set to the private
   directory, `ExecStart` set to the absolute Node path followed by the
   absolute paths of `server.mjs` and `config.json`, and
   `UMask=0077`. Set `Restart=on-failure` and install it under
   `default.target`. Reload the user units and enable and start the service.
4. In the HTTPS AppDev virtual host, proxy the exact
   `/ai-collaboration/` path to the configured loopback port. Forward
   the workspace cookie and request origin, pass through the service's
   response status and cache headers, and allow at least 60 seconds for
   a model response. Run `nginx -t` before reloading nginx, then perform
   the visibility and signed-in checks above.
5. Proxy the exact `/workspace/private-app-links.js` path to the same
   loopback service, forwarding the workspace cookie. Defer-load that
   script from the Home Applications panel through the workspace overlay.
   The pilot checks project membership before serving the script. A
   nonmember gets a generic 404 and receives no pilot title or link.

The AppDev workspace Nginx snippet uses the following exact location. Match
the port to the private pilot configuration.

```nginx
location = /workspace/private-app-links.js {
    access_log off;
    proxy_pass http://127.0.0.1:24686;
    proxy_set_header Host $host;
    proxy_intercept_errors off;
}
```

Inside the existing `location ^~ /workspace/` block of that snippet, add
the following filter alongside the other workspace overlays.

```nginx
sub_filter '<div class="programs" tabindex="0" aria-label="Applications">' '<script src="/workspace/private-app-links.js" defer></script><div class="programs" tabindex="0" aria-label="Applications">';
```

Keep the live configuration, member list, observer credential, database,
and database backups in private deployment storage. Commit application
source and documentation only.
