'use strict';

function locate(page, steps) {
  let target = page;
  for (const spec of steps ?? []) {
    if (spec.css) target = target.locator(spec.css);
    else if (spec.role) target = target.getByRole(spec.role, {
      name: spec.name ?? undefined, exact: spec.exact ?? true, includeHidden: spec.hidden ?? false,
    });
    else if (spec.label) target = target.getByLabel(spec.label, { exact: spec.exact ?? true });
    else if (spec.text) target = target.getByText(spec.text, { exact: spec.exact ?? true });
    if (spec.has) target = target.filter({ has: locate(page, spec.has) });
    if (spec.contains) target = target.filter({ hasText: spec.contains });
  }
  return target;
}

module.exports = { locate };
