import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Inspect authored, non-ignored documentation, including additions before commit.
// No HTTP requests, DB access, generated/vendor files, or file changes.
const root = fileURLToPath(new URL("../", import.meta.url));
const files = [...new Set(execFileSync("git", [
  "ls-files", "-z", "--cached", "--others", "--exclude-standard",
  "*.md", "*.mdx", "*.rst", "*.txt",
], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean))]
  .filter(file => existsSync(resolve(root, file)));
const failures = [];
let links = 0;
for (const file of files) {
  if (![".md", ".mdx"].includes(extname(file))) continue;
  const text = readFileSync(resolve(root, file), "utf8")
    .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "");
  // Local inline links and reference definitions. Anchors and external sites are
  // intentionally not checked: this command verifies repository file targets.
  const targets = [
    ...text.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+["'][^\n]*["'])?\s*\)/g),
    ...text.matchAll(/^\s*\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm),
  ];
  for (const match of targets) {
    const raw = match[1].replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(raw)) continue;
    let target;
    try { target = decodeURIComponent(raw.split(/[?#]/, 1)[0]); }
    catch { failures.push(`${file}: malformed link ${raw}`); continue; }
    if (!target) continue;
    links++;
    const absolute = resolve(root, dirname(file), target);
    if (!existsSync(absolute) || (!statSync(absolute).isFile() && !statSync(absolute).isDirectory())) {
      failures.push(`${file}: missing ${raw}`);
    }
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Documentation checked: ${files.length} files, ${links} local file links; no missing targets.`);
}
