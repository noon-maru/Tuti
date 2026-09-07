import { createRequire } from "node:module";
import { copyFile, cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
) as { version: string };
const destination = path.join(process.cwd(), "public/pdfjs", version);
await mkdir(destination, { recursive: true });
await copyFile(
  path.join(root, "legacy/build/pdf.worker.min.mjs"),
  path.join(destination, "pdf.worker.min.mjs"),
);
await copyFile(path.join(root, "LICENSE"), path.join(destination, "LICENSE"));
await cp(
  path.join(root, "standard_fonts"),
  path.join(destination, "standard_fonts"),
  { recursive: true },
);
await cp(path.join(root, "wasm"), path.join(destination, "wasm"), {
  recursive: true,
});
console.info(`PDF.js worker 준비 완료 (${version})`);
