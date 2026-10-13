import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const mediaDirectory = fileURLToPath(new URL("../../uploads/media/", import.meta.url));
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function storeImage(dataUrl: string) {
  const match = IMAGE_DATA_URL.exec(dataUrl);
  if (!match)
    throw Object.assign(new Error("Upload a PNG, JPG, or WebP image."), { statusCode: 400 });
  const [, format, encoded] = match;
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error("Images must be 5 MB or smaller."), { statusCode: 400 });
  }

  const validSignature = {
    png: bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpeg: bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217,
    webp: bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP",
  }[format];
  if (!validSignature)
    throw Object.assign(new Error("Image data did not match its file type."), { statusCode: 400 });

  const extension = format === "jpeg" ? "jpg" : format;
  const filename = `${crypto.randomUUID()}.${extension}`;
  await mkdir(mediaDirectory, { recursive: true });
  await writeFile(path.join(mediaDirectory, filename), bytes, { flag: "wx" });
  return `/uploads/media/${filename}`;
}

export function isStoredImageUrl(value: string) {
  return /^\/uploads\/media\/[0-9a-f-]+\.(?:png|jpg|webp)$/i.test(value) ||
    /^https?:\/\/[^\s]+\.(?:png|jpe?g|webp)(?:\?[^\s]*)?$/i.test(value);
}
