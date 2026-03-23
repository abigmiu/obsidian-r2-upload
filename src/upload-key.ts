export async function buildUploadFileName(opts: {
  extension: string;
  bytes: ArrayBuffer;
  namingStrategy: "uuid" | "content-hash";
  uuid: () => string;
}): Promise<string> {
  const extension = opts.extension.toLowerCase();
  const suffix = opts.namingStrategy === "uuid" ? opts.uuid() : await sha256Hex8(opts.bytes, opts.uuid);
  return `${suffix}.${extension}`;
}

async function sha256Hex8(bytes: ArrayBuffer, uuid: () => string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return uuid().replace(/-/g, "").slice(0, 8);
  }

  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hashBytes = new Uint8Array(hashBuffer);
  const hex = Array.from(hashBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 8);
}
