export type ImageDimensions = { imageWidth?: number | null; imageHeight?: number | null };
export function imageAspectRatio(size: ImageDimensions) {
  return size.imageWidth && size.imageHeight && Number.isFinite(size.imageWidth) && Number.isFinite(size.imageHeight) && size.imageWidth > 0 && size.imageHeight > 0
    ? size.imageWidth / size.imageHeight : 4 / 3;
}
/** Fits the entire selected image; the frame itself retains the selected ratio. */
export function fitHarumadiPhoto(size: ImageDimensions, width: number, maxHeight: number) {
  const aspect = imageAspectRatio(size);
  const height = Math.min(width / aspect, Math.max(1, maxHeight));
  return { width: Math.min(width, height * aspect), height };
}
export const IMAGE_CROP_RATIOS = [
  { id: "landscape", label: "가로", detail: "4:3", ratio: 4 / 3 },
  { id: "square", label: "정방형", detail: "1:1", ratio: 1 },
  { id: "portrait", label: "세로", detail: "3:4", ratio: 3 / 4 },
  { id: "original", label: "원본", detail: "그대로", ratio: null },
] as const;
export type ImageCropRatio = typeof IMAGE_CROP_RATIOS[number]["id"];
export function cropAspectRatio(mode: ImageCropRatio, width: number, height: number) {
  return IMAGE_CROP_RATIOS.find(item => item.id === mode)?.ratio ?? imageAspectRatio({ imageWidth: width, imageHeight: height });
}
export function cropOutputSize(width: number, height: number, limit = 1200) {
  const scale = Math.min(1, limit / width, limit / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
