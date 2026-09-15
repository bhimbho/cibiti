export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const uploadTypes = {
  "image/png": { extension: "png" },
  "image/jpeg": { extension: "jpg" },
  "image/gif": { extension: "gif" },
  "image/webp": { extension: "webp" },
} as const;

export type UploadMime = keyof typeof uploadTypes;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((byte, i) => bytes[offset + i] === byte);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/**
 * Identify the file from its leading bytes rather than trusting the browser's Content-Type or
 * the file name. SVG is deliberately unsupported because it can carry scripts.
 */
export function sniffMime(bytes: Uint8Array): UploadMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "image/gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  return null;
}
