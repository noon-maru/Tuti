import { access, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

const iconsDirectory = join(process.cwd(), "public", "assets", "icons");
const manifestPath = join(process.cwd(), "public", "manifest.json");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

await access(iconsDirectory, constants.R_OK);

for (const filename of await readdir(iconsDirectory)) {
  if (!filename.endsWith(".webp")) continue;

  const source = join(iconsDirectory, filename);
  const contents = await readFile(source);
  if (!contents.subarray(0, pngSignature.length).equals(pngSignature)) continue;

  const destination = join(iconsDirectory, filename.replace(/\.webp$/, ".png"));
  await rm(destination, { force: true });
  await rename(source, destination);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.icons = (manifest.icons ?? []).map((icon) => ({
  ...icon,
  src: icon.src.replace(/\.webp$/, ".png"),
  type: icon.src.endsWith(".webp") ? "image/png" : icon.type,
}));

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
