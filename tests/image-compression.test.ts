import assert from "node:assert/strict";
import test from "node:test";

import { compressImageForUpload } from "../src/image-compression.ts";

test("compresses supported raster images to webp before upload", async () => {
  const sourceBytes = Uint8Array.from([1, 2, 3, 4]).buffer;
  let receivedQuality = 0;

  const result = await compressImageForUpload({
    bytes: sourceBytes,
    fileName: "photo.PNG",
    enabled: true,
    quality: 0.75,
    encode: async (_bytes, quality) => {
      receivedQuality = quality;
      return Uint8Array.from([9, 8]).buffer;
    }
  });

  assert.equal(receivedQuality, 0.75);
  assert.equal(result.fileName, "photo.webp");
  assert.equal(result.contentType, "image/webp");
  assert.equal(result.compressed, true);
  assert.equal(result.bytes.byteLength, 2);
});

test("skips unsupported formats such as gif", async () => {
  const sourceBytes = Uint8Array.from([1, 2, 3, 4]).buffer;
  let called = false;

  const result = await compressImageForUpload({
    bytes: sourceBytes,
    fileName: "anim.gif",
    enabled: true,
    quality: 0.75,
    encode: async () => {
      called = true;
      return Uint8Array.from([9, 8]).buffer;
    }
  });

  assert.equal(called, false);
  assert.equal(result.fileName, "anim.gif");
  assert.equal(result.contentType, "image/gif");
  assert.equal(result.compressed, false);
  assert.equal(result.bytes.byteLength, 4);
});

test("falls back to the original file when webp output is not smaller", async () => {
  const sourceBytes = Uint8Array.from([1, 2, 3, 4]).buffer;

  const result = await compressImageForUpload({
    bytes: sourceBytes,
    fileName: "large.jpg",
    enabled: true,
    quality: 0.75,
    encode: async () => Uint8Array.from([1, 2, 3, 4, 5, 6]).buffer
  });

  assert.equal(result.fileName, "large.jpg");
  assert.equal(result.contentType, "image/jpeg");
  assert.equal(result.compressed, false);
  assert.equal(result.bytes.byteLength, 4);
});
