// Pure text transforms for the Xcode project's version settings.

/** Sets the user-visible version (CFBundleShortVersionString) in every build configuration. */
export function setMarketingVersion(pbxproj: string, version: string): string {
  return pbxproj.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
}

/** Raises the build number (CFBundleVersion) to one above the highest current value, everywhere. */
export function bumpBuild(pbxproj: string): string {
  const builds = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1]));
  const next = Math.max(0, ...builds) + 1;
  return pbxproj.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`);
}
