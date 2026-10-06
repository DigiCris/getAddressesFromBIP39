#!/usr/bin/env node
'use strict';

// Best-effort deletion of in.txt: overwrite with random bytes, sync, truncate, delete.
// This cannot guarantee physical erasure on SSDs or journaling/copy-on-write filesystems
// (APFS, NTFS, snapshots, backups...). Use encrypted storage for highly sensitive data.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.resolve('in.txt');

function overwriteAndDelete(file) {
  const fd = fs.openSync(file, 'r+');
  let size;
  try {
    size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(64 * 1024);
    let pos = 0;
    while (pos < size) {
      const len = Math.min(buf.length, size - pos);
      crypto.randomFillSync(buf, 0, len);
      pos += fs.writeSync(fd, buf, 0, len, pos);
    }
    fs.fsyncSync(fd);
    fs.ftruncateSync(fd, 0);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.unlinkSync(file);
  if (fs.existsSync(file)) throw new Error('in.txt still exists after deletion');
  return size;
}

try {
  if (!fs.existsSync(FILE)) {
    console.log(`in.txt not found in ${process.cwd()}. Nothing to delete.`);
    process.exit(0);
  }
  const size = overwriteAndDelete(FILE);
  console.log(`Overwritten: ${size} bytes`);
  console.log('Deleted: in.txt (verified it no longer exists)');
  console.log('Note: best-effort only. SSDs and modern filesystems may keep physical copies;');
  console.log('      use encrypted storage for highly sensitive material.');
} catch (err) {
  console.error(`Error: could not delete in.txt: ${err.message}`);
  process.exit(1);
}
