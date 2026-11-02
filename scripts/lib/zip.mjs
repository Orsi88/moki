// Minimal ZIP reader/writer (deflate/store), no dependencies. Used for
// claude.ai skill bundles and for .xlsx files (which are ZIP packages).

import { deflateRawSync, inflateRawSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// entries: Array<[name, Buffer|string]>
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const nameBuf = Buffer.from(name);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + compressed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// Returns Map<name, Buffer>. Reads sizes from the central directory, so it
// also handles archives written with data descriptors (Excel, LibreOffice).
// `limits` is for archives the user did not make (an uploaded .claude): { maxFiles, maxFileBytes, maxTotalBytes }
// are checked against the declared sizes before anything is inflated and enforced while inflating; a name with
// "..", a drive or leading "/", or a "\\" is refused; symbolic links are not followed and their names go to
// limits.skipped. Without `limits` nothing changes.
export function unzip(buf, limits) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('not a ZIP file (end of central directory not found)');
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  if (limits?.maxFiles && count > limits.maxFiles) throw new Error(`the ZIP has more than ${limits.maxFiles} files`);
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('corrupt ZIP central directory');
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const size = buf.readUInt32LE(ptr + 24);
    const unixMode = buf.readUInt32LE(ptr + 38) >>> 16;
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    if (limits) {
      if (name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.split('/').includes('..')) throw new Error(`unsafe path in the ZIP: ${name}`);
      if ((unixMode & 0xf000) === 0xa000) { limits.skipped?.push(name); ptr += 46 + nameLen + extraLen + commentLen; continue; }
      if (limits.maxFileBytes && size > limits.maxFileBytes) throw new Error(`${name} is larger than ${limits.maxFileBytes / 1048576} MB`);
      total += size;
      if (limits.maxTotalBytes && total > limits.maxTotalBytes) throw new Error(`the ZIP is larger than ${limits.maxTotalBytes / 1048576} MB`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compSize);
    if (method === 0) {
      if (limits?.maxFileBytes && raw.length > limits.maxFileBytes) throw new Error(`${name} is larger than ${limits.maxFileBytes / 1048576} MB`);
      files.set(name, Buffer.from(raw));
    }
    else if (method === 8) files.set(name, inflateRawSync(raw, limits?.maxFileBytes ? { maxOutputLength: limits.maxFileBytes } : undefined));
    else throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
