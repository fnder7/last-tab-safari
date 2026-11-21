import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bumpBuild, setMarketingVersion } from '../scripts/version-lib.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('manifest, Xcode project and package.json carry the same version', () => {
  const { version } = JSON.parse(read('package.json'));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read('static/manifest.json')).version, version);
  const marketing = [...read('Last Tab/Last Tab.xcodeproj/project.pbxproj').matchAll(/MARKETING_VERSION = ([^;]+);/g)];
  assert.ok(marketing.length > 0);
  for (const [, v] of marketing) assert.equal(v, version);
});

test('setMarketingVersion rewrites every MARKETING_VERSION', () => {
  const src = 'A\n\tMARKETING_VERSION = 1.0;\nB\n\tMARKETING_VERSION = 1.0;\n';
  assert.equal(setMarketingVersion(src, '1.2.3'), 'A\n\tMARKETING_VERSION = 1.2.3;\nB\n\tMARKETING_VERSION = 1.2.3;\n');
});

test('bumpBuild increments every CURRENT_PROJECT_VERSION from the highest one', () => {
  const src = 'CURRENT_PROJECT_VERSION = 3;\nCURRENT_PROJECT_VERSION = 4;\n';
  assert.equal(bumpBuild(src), 'CURRENT_PROJECT_VERSION = 5;\nCURRENT_PROJECT_VERSION = 5;\n');
});
