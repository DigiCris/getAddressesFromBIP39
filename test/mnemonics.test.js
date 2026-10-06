'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Mnemonic, randomBytes } = require('ethers');
const { parseMnemonics, deriveAddress } = require('../lib/mnemonics');

// TEST DATA: public BIP39 test vector (all-zero entropy). Never holds funds.
const TEST_VECTOR = Array(23).fill('abandon').concat('art').join(' ');
// Address for m/44'/60'/0'/0/0, cross-checked with Foundry `cast wallet address --mnemonic`.
const TEST_VECTOR_ADDRESS = '0xF278cF59F82eDcf871d630F28EcC8056f25C1cdb';

// Ephemeral 24-word mnemonic generated only for this test run.
const randomMnemonic = () => Mnemonic.fromEntropy(randomBytes(32)).phrase;

test('valid 24-word mnemonic is accepted', () => {
  assert.deepStrictEqual(parseMnemonics(TEST_VECTOR), [{ line: 1, phrase: TEST_VECTOR }]);
});

test('derives the expected address for m/44\'/60\'/0\'/0/0', () => {
  assert.strictEqual(deriveAddress(TEST_VECTOR), TEST_VECTOR_ADDRESS);
});

test('invalid checksum is rejected with line number only', () => {
  const bad = Array(24).fill('abandon').join(' ');
  assert.throws(() => parseMnemonics(`${TEST_VECTOR}\n${bad}`), (err) => {
    assert.match(err.message, /line 2: invalid BIP39 mnemonic/);
    assert.doesNotMatch(err.message, /abandon/);
    return true;
  });
});

test('unknown word is rejected', () => {
  const bad = TEST_VECTOR.replace(/art$/, 'notaword');
  assert.throws(() => parseMnemonics(bad), /line 1: invalid BIP39 mnemonic/);
});

test('valid mnemonic with wrong word count is rejected', () => {
  // TEST DATA: valid public 12-word vector, rejected because 24 words are required.
  const twelve = Array(11).fill('abandon').concat('about').join(' ');
  assert.throws(() => parseMnemonics(twelve), (err) => {
    assert.match(err.message, /line 1: expected 24 words, found 12/);
    assert.doesNotMatch(err.message, /abandon/);
    return true;
  });
});

test('multiple lines, blank lines, extra spaces, CRLF and BOM keep order', () => {
  const m = [randomMnemonic(), randomMnemonic(), randomMnemonic()];
  const text = `﻿\r\n  ${m[0]}  \r\n\r\n${m[1].replace(/ /g, '   ')}\r\n   \n${m[2]}\n\n`;

  const parsed = parseMnemonics(text);
  assert.deepStrictEqual(parsed.map((p) => p.phrase), m);
  assert.deepStrictEqual(parsed.map((p) => p.line), [2, 4, 6]);
  assert.deepStrictEqual(
    parsed.map((p) => deriveAddress(p.phrase)),
    m.map((phrase) => deriveAddress(phrase))
  );
});

test('empty input yields no mnemonics', () => {
  assert.deepStrictEqual(parseMnemonics('\n  \n'), []);
});
