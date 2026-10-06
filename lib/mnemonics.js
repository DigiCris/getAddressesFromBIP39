'use strict';

const { Mnemonic, HDNodeWallet } = require('ethers');

const DERIVATION_PATH = "m/44'/60'/0'/0/0";
const WORD_COUNT = 24;

// Parses in.txt content: one mnemonic per line, blank lines ignored, order preserved.
// Errors only mention the line number, never the line content.
function parseMnemonics(text) {
  const mnemonics = [];
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;

    const words = line.split(/\s+/);
    if (words.length !== WORD_COUNT) {
      throw new Error(`in.txt line ${i + 1}: expected ${WORD_COUNT} words, found ${words.length}`);
    }
    const phrase = words.join(' ');
    if (!Mnemonic.isValidMnemonic(phrase)) {
      throw new Error(`in.txt line ${i + 1}: invalid BIP39 mnemonic (unknown word or bad checksum)`);
    }
    mnemonics.push({ line: i + 1, phrase });
  });

  return mnemonics;
}

// Returns the checksummed EVM address of account 0 (m/44'/60'/0'/0/0).
function deriveAddress(phrase) {
  return HDNodeWallet.fromPhrase(phrase, '', DERIVATION_PATH).address;
}

module.exports = { DERIVATION_PATH, WORD_COUNT, parseMnemonics, deriveAddress };
