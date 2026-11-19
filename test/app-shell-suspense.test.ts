import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("모든 앱 경로의 약관·URL 조회는 페이지보다 바깥의 Suspense 경계에서 보호한다", () => {
  const layout = readFileSync("src/app/(tuti)/layout.tsx", "utf8");
  const shell = readFileSync("src/features/tuti/components/TutiAppShell.tsx", "utf8");
  assert.match(layout, /import \{ Suspense \} from "react"/);
  assert.match(layout, /<Suspense fallback=\{null\}><TutiAppShell>\{children\}<\/TutiAppShell><\/Suspense>/);
  assert.match(shell, /<InitialServiceTermsGate/);
  assert.match(layout, /robots: \{ index: false, follow: false \}/);
  assert.doesNotMatch(layout, /force-dynamic|connection\(|TutiWordmark|LoadingIndicator/);
});
