import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

/**
 * Minimal ZIP writer for release archives: deflate per file, no encryption,
 * no ZIP64 (extension bundles are a few MB). Entries are sorted and stamped
 * with a fixed date so the same input always produces the same bytes.
 */
export async function zipDirectory(dir: string): Promise<Buffer> {
  const files = (await listFiles(dir)).sort();
  const entries = await Promise.all(
    files.map(async (rel) => ({
      name: rel.split(path.sep).join("/"),
      data: await readFile(path.join(dir, rel)),
    }))
  );
  return zipEntries(entries);
}

export function zipEntries(entries: { name: string; data: Buffer }[]): Buffer {
  // 1980-01-01 00:00 in MS-DOS format: the earliest representable stamp.
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, compressed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, ...centrals, end]);
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path.join(dir, prefix), {
    withFileTypes: true,
  })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(dir, rel)));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}
