import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = process.cwd();

const [packageContents, androidContents, iosContents] = await Promise.all([
  readFile(resolve(projectRoot, "package.json"), "utf8"),
  readFile(resolve(projectRoot, "android/app/build.gradle"), "utf8"),
  readFile(
    resolve(projectRoot, "ios/App/Tuti.xcodeproj/project.pbxproj"),
    "utf8",
  ),
]);

const packageVersion = readPackageVersion(packageContents);
const androidVersionName = readSingleMatch(
  androidContents,
  /versionName\s+"([^"]+)"/g,
  "Android versionName",
);
const androidVersionCode = readSingleMatch(
  androidContents,
  /versionCode\s+(\d+)/g,
  "Android versionCode",
);
const iosMarketingVersions = readMatches(
  iosContents,
  /MARKETING_VERSION = ([^;]+);/g,
  "iOS MARKETING_VERSION",
);
const iosBuildNumbers = readMatches(
  iosContents,
  /CURRENT_PROJECT_VERSION = ([^;]+);/g,
  "iOS CURRENT_PROJECT_VERSION",
);

const mismatches = [
  androidVersionName === packageVersion
    ? null
    : `Android versionName ${androidVersionName} != package ${packageVersion}`,
  ...iosMarketingVersions.map((version) =>
    version === packageVersion
      ? null
      : `iOS MARKETING_VERSION ${version} != package ${packageVersion}`,
  ),
].filter((message): message is string => message !== null);

if (new Set(iosBuildNumbers).size !== 1) {
  mismatches.push(
    `iOS Debug·Release 빌드 번호가 다릅니다: ${iosBuildNumbers.join(", ")}`,
  );
}

if (mismatches.length > 0) {
  throw new Error(`네이티브 앱 버전이 일치하지 않습니다.\n${mismatches.join("\n")}`);
}

console.info(
  [
    `Tuti ${packageVersion}`,
    `Android versionCode ${androidVersionCode}`,
    `iOS build ${iosBuildNumbers[0]}`,
  ].join(" · "),
);

function readPackageVersion(contents: string) {
  const parsed = JSON.parse(contents) as { version?: unknown };
  if (typeof parsed.version !== "string" || !parsed.version.trim()) {
    throw new Error("package.json의 version을 확인하지 못했습니다.");
  }
  return parsed.version.trim();
}

function readSingleMatch(
  contents: string,
  pattern: RegExp,
  label: string,
) {
  const matches = readMatches(contents, pattern, label);
  if (matches.length !== 1) {
    throw new Error(`${label}은 하나만 있어야 합니다. 현재: ${matches.length}`);
  }
  return matches[0];
}

function readMatches(contents: string, pattern: RegExp, label: string) {
  const matches = [...contents.matchAll(pattern)].map((match) =>
    match[1].trim(),
  );
  if (matches.length === 0) {
    throw new Error(`${label}을 확인하지 못했습니다.`);
  }
  return matches;
}
