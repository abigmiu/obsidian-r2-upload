import assert from "node:assert/strict";
import test from "node:test";

import { buildUploadFileName } from "../src/upload-key.ts";

test("uses only the generated suffix when building upload file names", async () => {
  const bytes = Uint8Array.from([1, 2, 3, 4]).buffer;

  const fileName = await buildUploadFileName({
    extension: "webp",
    bytes,
    namingStrategy: "uuid",
    uuid: () => "abc-123"
  });

  assert.equal(fileName, "abc-123.webp");
  assert.equal(fileName.includes("photo"), false);
});
