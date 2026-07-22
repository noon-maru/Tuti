import { constants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";

type ManifestIcon = {
  src: string;
  type?: string;
  [key: string]: unknown;
};

type WebManifest = {
  icons?: ManifestIcon[];
  [key: string]: unknown;
};

const generatedIconsDirectory = join(
  process.cwd(),
  "public",
  "assets",
  "icons",
);
const appIconsDirectory = join(process.cwd(), "public", "app-icons");
const manifestPath = join(process.cwd(), "public", "manifest.json");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function main() {
  await access(generatedIconsDirectory, constants.R_OK);
  await mkdir(appIconsDirectory, { recursive: true });
  const normalizedIcons = new Map<string, string>();

  for (const filename of await readdir(generatedIconsDirectory)) {
    if (!filename.endsWith(".png") && !filename.endsWith(".webp")) continue;

    const source = join(generatedIconsDirectory, filename);
    const contents = await readFile(source);
    const isPng = contents.subarray(0, pngSignature.length).equals(pngSignature);
    const normalizedFilename =
      filename.endsWith(".webp") && isPng
        ? filename.replace(/\.webp$/, ".png")
        : filename;
    const destination = join(appIconsDirectory, normalizedFilename);

    await rm(destination, { force: true });
    await rename(source, destination);
    normalizedIcons.set(filename, normalizedFilename);
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as WebManifest;
  manifest.icons = (manifest.icons ?? []).map((icon) => {
    const generatedFilename = basename(icon.src);
    const normalizedFilename =
      normalizedIcons.get(generatedFilename) ?? generatedFilename;

    return {
      ...icon,
      src: `app-icons/${normalizedFilename}`,
      type: normalizedFilename.endsWith(".png") ? "image/png" : icon.type,
    };
  });

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

await main();
