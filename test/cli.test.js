'use strict';

// Runs getAddresses.js and deleteInput.js as real CLIs inside a temporary directory.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { Mnemonic, randomBytes } = require('ethers');
const { deriveAddress } = require('../lib/mnemonics');

const ROOT = path.join(__dirname, '..');
const randomMnemonic = () => Mnemonic.fromEntropy(randomBytes(32)).phrase;

function run(script, cwd) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script)], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bip39-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function assertNoSecrets(output, mnemonics) {
  for (const m of mnemonics) {
    // No 3 consecutive mnemonic words may appear in the output.
    const w = m.split(' ');
    for (let i = 0; i + 3 <= w.length; i++) assert.ok(!output.includes(w.slice(i, i + 3).join(' ')), 'mnemonic leaked');
  }
  assert.doesNotMatch(output, /0x[0-9a-fA-F]{64}/, 'private key leaked');
}

test('getAddresses.js writes out.txt in the same order as in.txt', (t) => {
  const dir = tmpDir(t);
  const m = [randomMnemonic(), randomMnemonic(), randomMnemonic(), randomMnemonic()];
  fs.writeFileSync(path.join(dir, 'in.txt'), `${m[0]}\n\n  ${m[1]}\r\n${m[2]}\n\n\n${m[3]}`);

  const r = run('getAddresses.js', dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /Processed: 4 mnemonics/);
  assert.match(r.out, /Generated: 4 addresses/);
  assert.match(r.out, /Output: out\.txt/);
  assertNoSecrets(r.out, m);

  const out = fs.readFileSync(path.join(dir, 'out.txt'), 'utf8');
  assert.strictEqual(out, m.map(deriveAddress).join('\n') + '\n');
});

test('getAddresses.js overwrites an existing out.txt', (t) => {
  const dir = tmpDir(t);
  const m = randomMnemonic();
  fs.writeFileSync(path.join(dir, 'out.txt'), 'old content\nmore old content\n');
  fs.writeFileSync(path.join(dir, 'in.txt'), m);
  assert.strictEqual(run('getAddresses.js', dir).code, 0);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'out.txt'), 'utf8'), `${deriveAddress(m)}\n`);
});

test('getAddresses.js fails on an invalid line without printing it and without writing out.txt', (t) => {
  const dir = tmpDir(t);
  const good = randomMnemonic();
  const bad = randomMnemonic().split(' ').reverse().join(' '); // almost surely a bad checksum
  fs.writeFileSync(path.join(dir, 'in.txt'), `${good}\n\n${good.split(' ').slice(0, 12).join(' ')}\n${bad}`);

  const r = run('getAddresses.js', dir);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /in\.txt line 3: expected 24 words, found 12/);
  assertNoSecrets(r.out, [good, bad]);
  assert.ok(!fs.existsSync(path.join(dir, 'out.txt')));
});

test('getAddresses.js fails clearly when in.txt is missing or empty', (t) => {
  const dir = tmpDir(t);
  let r = run('getAddresses.js', dir);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /in\.txt not found/);

  fs.writeFileSync(path.join(dir, 'in.txt'), '\n \n');
  r = run('getAddresses.js', dir);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /in\.txt contains no mnemonics/);
});

test('deleteInput.js removes in.txt without printing its content', (t) => {
  const dir = tmpDir(t);
  const m = [randomMnemonic(), randomMnemonic()];
  const file = path.join(dir, 'in.txt');
  fs.writeFileSync(file, m.join('\n') + '\n');
  const size = fs.statSync(file).size;

  const r = run('deleteInput.js', dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(!fs.existsSync(file));
  assert.match(r.out, new RegExp(`Overwritten: ${size} bytes`));
  assert.match(r.out, /best-effort/);
  assertNoSecrets(r.out, m);

  const again = run('deleteInput.js', dir);
  assert.strictEqual(again.code, 0);
  assert.match(again.out, /Nothing to delete/);
});
