import sharp from "sharp";
import { HarumadiError } from "@/server/harumadi/errors";

/** Small private avatar lives in the same DB transaction and deletion lifecycle as its profile. */
export async function preparePetPhoto(body: unknown): Promise<string | null | undefined> {
  if (!body || typeof body !== "object" || !("photo" in body) || body.photo === undefined) return undefined;
  if (body.photo === null) return null;
  if (typeof body.photo !== "string" || body.photo.length > 720_000) throw new HarumadiError("사진 크기를 줄인 뒤 다시 선택해주세요.");
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.photo);
  if (!match) throw new HarumadiError("JPEG·PNG·WebP 사진을 선택해주세요.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 512 * 1024 || bytes.toString("base64") !== match[2]) throw new HarumadiError("사진 크기를 줄인 뒤 다시 선택해주세요.");
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 16_000_000, animated: false });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new Error("unsupported");
    // Sharp strips EXIF (including GPS); never keep the original upload.
    const photo = await image.rotate().resize(384, 384, { fit: "cover" }).webp({ quality: 75 }).toBuffer();
    if (photo.length > 128 * 1024) throw new Error("too_large");
    return `data:image/webp;base64,${photo.toString("base64")}`;
  } catch { throw new HarumadiError("사진을 읽지 못했어요. 다른 사진을 선택해주세요."); }
}
