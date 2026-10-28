import { pathToFileURL } from "node:url";

export function supportsNodeRuntime(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major === 26 && (minor > 12 || (minor === 12 && patch >= 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!supportsNodeRuntime(process.version)) {
    console.error(`Node.js 26.12.1 이상(26.x)이 필요합니다. 현재: ${process.version}`);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ node: process.version, supported: true }));
  }
}
