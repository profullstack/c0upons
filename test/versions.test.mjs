// The repo carries its version in more places than anyone can hold in their
// head, and they had already drifted apart: the root and both workspaces said
// 0.1.0, the shipped CLI said 1.2.0, and the git tag agreed with the CLI. The
// shell script is the one that users actually see (`c0upons version`), so a
// silent disagreement means the version someone reports in a bug is not the
// version of the tree it came from.
//
// Nothing derives these automatically — the shell script is downloaded
// standalone, so its version has to be a literal — which is exactly why it
// needs a check instead of a convention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const root = read('../package.json');
const web = read('../apps/web/package.json');
const cli = read('../apps/cli/package.json');

/** The literal the shipped shell CLI reports as `c0upons version`. */
function shippedCliVersion() {
  const script = readFileSync(new URL('../apps/web/public/cli/c0upons', import.meta.url), 'utf8');
  const match = /^VERSION="([^"]+)"$/m.exec(script);
  assert.ok(match, 'could not find a VERSION="…" line in apps/web/public/cli/c0upons');
  return match[1];
}

test('every workspace agrees with the root version', () => {
  assert.equal(web.version, root.version, '@c0upons/web disagrees with the root package version');
  assert.equal(cli.version, root.version, '@c0upons/cli disagrees with the root package version');
});

test('the shipped CLI reports the repo version', () => {
  assert.equal(
    shippedCliVersion(),
    root.version,
    'apps/web/public/cli/c0upons VERSION= is out of step with package.json — bump both, since the ' +
      'script is served standalone and cannot read package.json at runtime'
  );
});

// The upgrade path replaces the binary from this URL, so a CLI that points
// somewhere else would strand every installed copy on its current version.
test('the shipped CLI upgrades from the canonical URL', () => {
  const script = readFileSync(new URL('../apps/web/public/cli/c0upons', import.meta.url), 'utf8');
  assert.match(script, /https:\/\/c0upons\.com\/cli\/c0upons/);
});
