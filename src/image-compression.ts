export interface CompressImageForUploadOptions {
  bytes: ArrayBuffer;
  fileName: string;
  enabled: boolean;
  quality: number;
  encode?: WebpEncoder;
}

export interface UploadImagePayload {
  bytes: ArrayBuffer;
  fileName: string;
  contentType?: string;
  compressed: boolean;
}

type WebpEncoder = (bytes: ArrayBuffer, quality: number) => Promise<ArrayBuffer>;

const WEBP_CANDIDATE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp"]);

export async function compressImageForUpload(options: CompressImageForUploadOptions): Promise<UploadImagePayload> {
  const original: UploadImagePayload = {
    bytes: options.bytes,
    fileName: options.fileName,
    contentType: guessContentTypeFromName(options.fileName),
    compressed: false
  };

  if (!options.enabled || !isWebpCompressionCandidate(options.fileName)) {
    return original;
  }

  const encode = options.encode ?? encodeImageBufferToWebp;
  const webpBytes = await encode(options.bytes, normalizeQuality(options.quality));
  if (webpBytes.byteLength === 0 || webpBytes.byteLength >= options.bytes.byteLength) {
    return original;
  }

  return {
    bytes: webpBytes,
    fileName: replaceExtension(options.fileName, "webp"),
    contentType: "image/webp",
    compressed: true
  };
}

export function isWebpCompressionCandidate(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return WEBP_CANDIDATE_EXTENSIONS.has(ext);
}

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function replaceExtension(fileName: string, nextExtension: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return `${fileName}.${nextExtension}`;
  return `${fileName.slice(0, dotIndex)}.${nextExtension}`;
}

function normalizeQuality(value: number): number {
  if (!Number.isFinite(value)) return 0.75;
  return Math.min(1, Math.max(0, value));
}

function guessContentTypeFromName(fileName: string): string | undefined {
  switch (getFileExtension(fileName)) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    case "heic":
      return "image/heic";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "bmp":
      return "image/bmp";
    default:
      return undefined;
  }
}

async function encodeImageBufferToWebp(bytes: ArrayBuffer, quality: number): Promise<ArrayBuffer> {
  const sourceBlob = new Blob([bytes]);
  const bitmap = await createImageBitmap(sourceBlob);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2d canvas context unavailable");
    }

    context.drawImage(bitmap, 0, 0);
    const webpBlob = await canvasToBlob(canvas, quality);
    return await webpBlob.arrayBuffer();
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("failed to encode canvas to webp"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}
