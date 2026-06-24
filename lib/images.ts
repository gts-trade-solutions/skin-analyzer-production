import sharp from "sharp";

// Perfect Corp Skin Analysis: max 2560px long side, <10 MB, JPG/PNG, and HD
// quality needs the short side >= 1080px. We cap the long side at 2048 (well
// inside the limit, HD-capable) and re-encode at q85 — only downscaling, never
// enlarging, so we keep as much detail as the source provides.
const MAX_DIM = 2048;
const JPEG_QUALITY = 85;

export type ProcessedImage = {
  buffer: Buffer;
  contentType: "image/jpeg";
  width: number;
  height: number;
};

/**
 * Decode, auto-orient, downscale, and re-encode to JPEG.
 *
 * `.rotate()` bakes EXIF orientation into the pixels; re-encoding to JPEG
 * drops all metadata, so GPS/EXIF is stripped from the stored face photo.
 * Throws if the input doesn't decode as a real image.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const { data, info } = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({
      width: MAX_DIM,
      height: MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: "image/jpeg",
    width: info.width,
    height: info.height,
  };
}
