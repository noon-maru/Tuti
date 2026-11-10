import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("스토어 버전·빌드 번호·첫 출시 노트와 Android 업로드 문안이 일치한다", () => {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const android = readFileSync("android/app/build.gradle", "utf8");
  const ios = readFileSync("ios/App/Tuti.xcodeproj/project.pbxproj", "utf8");
  const notes = readFileSync("docs/release-notes.md", "utf8");
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(android.match(/versionName\s+"([^"]+)"/)?.[1], version);
  const build = android.match(/versionCode\s+(\d+)/)?.[1];
  assert.ok(build);
  for (const match of ios.matchAll(/MARKETING_VERSION = ([^;]+);/g)) assert.equal(match[1], version);
  for (const match of ios.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)) assert.equal(match[1], build);
  assert.equal(notes.match(/^## (\d+\.\d+\.\d+)$/m)?.[1], version);
  const latest = notes.split(`## ${version}\n`)[1]?.split(/^## /m)[0];
  assert.ok(latest);
  assert.ok(latest.includes(`빌드 번호: \`${build}\``));
  const common = latest.split("### 공통 출시 노트\n")[1]?.split("### iOS 프로모션 텍스트")[0].trim();
  const play = readFileSync("distribution/google-play/whatsnew/whatsnew-ko-KR", "utf8").trim();
  assert.equal(play, common); assert.ok(Array.from(play).length <= 500);
  const promotion = latest.split("### iOS 프로모션 텍스트\n")[1]?.trim().split("\n\n")[0];
  assert.ok(promotion && Array.from(promotion).length <= 170);
});
