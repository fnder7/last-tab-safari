// Usage: npm run set-version -- 1.2.0
// Writes the version to package.json, the extension manifest and the Xcode project,
// and bumps the Xcode build number. package.json is the source of truth.
import { readFileSync, writeFileSync } from 'node:fs';
import { bumpBuild, setMarketingVersion } from './version-lib.ts';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run set-version -- <major.minor.patch>');
  process.exit(1);
}

const editJson = (path: string) => {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data.version = version;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
};

editJson('package.json');
editJson('static/manifest.json');
const pbxproj = 'Last Tab/Last Tab.xcodeproj/project.pbxproj';
writeFileSync(pbxproj, bumpBuild(setMarketingVersion(readFileSync(pbxproj, 'utf8'), version)));
console.log(`version ${version}`);
