#!/usr/bin/env node
'use strict';

// in.txt (BIP39 mnemonics, one per line) -> out.txt (EVM addresses, same order).
// Runs fully offline. Never prints mnemonics or private keys.

const fs = require('fs');
const path = require('path');
const { parseMnemonics, deriveAddress, DERIVATION_PATH } = require('./lib/mnemonics');

const INPUT = path.resolve('in.txt');
const OUTPUT = path.resolve('out.txt');

function main() {
  if (!fs.existsSync(INPUT)) throw new Error(`in.txt not found in ${process.cwd()}`);

  const mnemonics = parseMnemonics(fs.readFileSync(INPUT, 'utf8'));
  if (mnemonics.length === 0) throw new Error('in.txt contains no mnemonics');

  const addresses = mnemonics.map(({ line, phrase }) => {
    try {
      return deriveAddress(phrase);
    } catch {
      throw new Error(`in.txt line ${line}: could not derive address`);
    }
  });

  fs.writeFileSync(OUTPUT, addresses.join('\n') + '\n');

  console.log(`Path: ${DERIVATION_PATH}`);
  console.log(`Processed: ${mnemonics.length} mnemonics`);
  console.log(`Generated: ${addresses.length} addresses`);
  console.log('Output: out.txt');
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
