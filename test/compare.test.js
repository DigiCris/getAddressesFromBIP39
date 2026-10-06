'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Wallet } = require('ethers');
const { parseAddresses, compareAddresses, formatSafeTxt } = require('../lib/safe');

const [A, B, C, D] = Array.from({ length: 4 }, () => Wallet.createRandom().address);
const owners = [A, B, C];
const entries = (...addrs) => addrs.map((address, i) => ({ line: i + 1, address }));

test('perfect match', () => {
  const r = compareAddresses(entries(A, B, C), owners);
  assert.deepStrictEqual(r, { match: true, countMismatch: false, duplicates: [], missing: [], extra: [] });
});

test('different order still matches', () => {
  assert.strictEqual(compareAddresses(entries(C, A, B), owners).match, true);
});

test('different count (subset) reports missing owner', () => {
  const r = compareAddresses(entries(A, B), owners);
  assert.strictEqual(r.match, false);
  assert.strictEqual(r.countMismatch, true);
  assert.deepStrictEqual(r.missing, [C]);
  assert.deepStrictEqual(r.extra, []);
});

test('extra address reports count mismatch and extra', () => {
  const r = compareAddresses(entries(A, B, C, D), owners);
  assert.strictEqual(r.match, false);
  assert.strictEqual(r.countMismatch, true);
  assert.deepStrictEqual(r.extra, [D]);
});

test('replaced address reports missing and extra with same count', () => {
  const r = compareAddresses(entries(A, D, C), owners);
  assert.strictEqual(r.match, false);
  assert.strictEqual(r.countMismatch, false);
  assert.deepStrictEqual(r.missing, [B]);
  assert.deepStrictEqual(r.extra, [D]);
});

test('duplicates are detected even if the set matches', () => {
  const r = compareAddresses(entries(A, B, C, A), owners);
  assert.strictEqual(r.match, false);
  assert.deepStrictEqual(r.duplicates, [{ address: A, lines: [1, 4] }]);
  assert.deepStrictEqual(r.missing, []);
  assert.deepStrictEqual(r.extra, []);
});

test('lowercase and uppercase addresses are normalized', () => {
  const text = `${A.toLowerCase()}\n\n0x${B.slice(2).toUpperCase()}\r\n  ${C}  \n`;
  const parsed = parseAddresses(text);
  assert.deepStrictEqual(parsed, [
    { line: 1, address: A },
    { line: 3, address: B },
    { line: 4, address: C },
  ]);
  assert.strictEqual(compareAddresses(parsed, owners.map((o) => o.toLowerCase())).match, true);
});

test('invalid address or bad mixed-case checksum is rejected with line number', () => {
  assert.throws(() => parseAddresses(`${A}\n0x1234`), /out\.txt line 2: invalid Ethereum address/);
  // TEST DATA: valid checksum is 0xF278cF59F82eDcf871d630F28EcC8056f25C1cdb; one letter's case flipped.
  assert.throws(() => parseAddresses('0xF278CF59F82eDcf871d630F28EcC8056f25C1cdb'), /out\.txt line 1: invalid Ethereum address/);
});

test('safe.txt format', () => {
  const txt = formatSafeTxt({ address: D, chainId: '1', version: '1.5.0', threshold: 2, owners });
  assert.strictEqual(
    txt,
    `Safe: ${D}\nChain ID: 1\nVersion: 1.5.0\nThreshold: 2\nSigners: 3\n\n${A}\n${B}\n${C}\n`
  );
});
