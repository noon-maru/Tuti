import { cropOutputSize } from "@/shared/harumadi/imageGeometry";

/** Keep the entire photo, but never persist the selected file or its EXIF metadata. */
export async function prepareMadiPhoto(file: File): Promise<string> {
  const source = URL.createObjectURL(file);
  const image = new Image();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("photo_decode_timeout")), 20_000);
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("photo_decode_failed"));
      image.src = source;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("photo_size_invalid");
    const { width, height } = cropOutputSize(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_context_unavailable");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const result = canvas.toDataURL("image/jpeg", 0.9);
    if (!result.startsWith("data:image/jpeg;base64,")) throw new Error("photo_encode_failed");
    return result;
  } finally {
    clearTimeout(timer);
    image.onload = null; image.onerror = null;
    URL.revokeObjectURL(source);
  }
}
