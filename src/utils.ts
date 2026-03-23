import { App, TFile, normalizePath } from "obsidian";
import { buildUploadFileName } from "./upload-key";

export function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "heic", "tif", "tiff", "bmp"].includes(ext);
}

export function sanitizeBaseName(baseName: string): string {
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return sanitized || "image";
}

export function makeUuid(): string {
  // Prefer native UUID
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && "randomUUID" in cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  // Fallback UUID v4 via getRandomValues
  if (!cryptoObj?.getRandomValues) {
    // last resort
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function guessContentType(fileName: string): string | undefined {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
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

export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  if (!normalized || normalized === "/") return;

  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing) return;

  const parts = normalized.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

export async function buildUploadKey(opts: {
  file: TFile;
  bytes: ArrayBuffer;
  namingStrategy: "uuid" | "content-hash";
  pathPrefix: string;
  uuid: () => string;
  sanitizeBaseName: (base: string) => string;
}): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const fileName = await buildUploadFileName({
    extension: opts.file.extension,
    bytes: opts.bytes,
    namingStrategy: opts.namingStrategy,
    uuid: opts.uuid
  });
  const prefix = opts.pathPrefix || "";
  return normalizePath(`${prefix}${yyyy}/${mm}/${dd}/${fileName}`);
}
