// @vitest-environment node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { zipDirectory } from "../../../scripts/zip";

/** Read entries back through the central directory, as unzip tools do. */
function readZip(zip: Buffer): Map<string, Buffer> {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(cursor + 16);
    const size = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const offset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    const localName = zip.readUInt16LE(offset + 26);
    const start = offset + 30 + localName;
    const data = inflateRawSync(zip.subarray(start, start + size));
    expect(crc32(data)).toBe(crc);
    files.set(name, data);
    cursor += 46 + nameLength;
  }
  return files;
}

describe("zipDirectory", () => {
  it("round-trips nested files with forward-slash names", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lce-zip-"));
    await mkdir(path.join(dir, "data", "companies"), { recursive: true });
    await writeFile(path.join(dir, "manifest.json"), '{"a":1}');
    await writeFile(
      path.join(dir, "data", "companies", "google.json"),
      "x".repeat(10_000)
    );

    const zip = await zipDirectory(dir);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual([
      "data/companies/google.json",
      "manifest.json",
    ]);
    expect(files.get("manifest.json")!.toString()).toBe('{"a":1}');
    expect(files.get("data/companies/google.json")!.length).toBe(10_000);
    // Deterministic: same input, same bytes.
    expect((await zipDirectory(dir)).equals(zip)).toBe(true);
  });
});
