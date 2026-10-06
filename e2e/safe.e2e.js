'use strict';

// End-to-end test: local Anvil node + official Safe v1.5.0 contracts
// (@safe-global/safe-smart-account). All mnemonics are ephemeral TEST DATA.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { ContractFactory, JsonRpcProvider, Mnemonic, Wallet, ZeroAddress, randomBytes } = require('ethers');

const ROOT = path.join(__dirname, '..');
const ARTIFACTS = '@safe-global/safe-smart-account/build/artifacts/contracts/';
const hasAnvil = spawnSync('anvil', ['--version']).status === 0;
const hasCast = spawnSync('cast', ['--version']).status === 0;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForRpc(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Anvil did not start');
}

async function deploy(artifact, signer) {
  const { abi, bytecode } = require(ARTIFACTS + artifact);
  const contract = await new ContractFactory(abi, bytecode, signer).deploy();
  await contract.waitForDeployment();
  return contract;
}

async function createSafe(factory, singleton, owners, threshold, salt) {
  const setup = singleton.interface.encodeFunctionData('setup', [
    owners, threshold, ZeroAddress, '0x', ZeroAddress, ZeroAddress, 0, ZeroAddress,
  ]);
  const receipt = await (await factory.createProxyWithNonce(await singleton.getAddress(), setup, salt)).wait();
  const event = receipt.logs.map((l) => factory.interface.parseLog(l)).find((e) => e && e.name === 'ProxyCreation');
  return event.args.proxy;
}

test('end-to-end with Anvil and a real Safe', { skip: !hasAnvil && 'anvil not found (install Foundry)' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bip39-e2e-'));
  const port = await freePort();
  const rpc = `http://127.0.0.1:${port}`;
  const anvil = spawn('anvil', ['--port', String(port), '--silent'], { stdio: 'ignore' });
  const provider = new JsonRpcProvider(rpc, 31337, { staticNetwork: true });
  t.after(() => {
    provider.destroy();
    anvil.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await waitForRpc(rpc);

  const run = (script, args = [], env = {}) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, RPC_URL: '', ...env },
    });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const file = (name) => path.join(dir, name);
  const writeOut = (lines) => fs.writeFileSync(file('out.txt'), lines.join('\n') + '\n');

  // Ephemeral TEST mnemonics and their expected addresses.
  const mnemonics = Array.from({ length: 3 }, () => Mnemonic.fromEntropy(randomBytes(32)).phrase);
  const expected = mnemonics.map((m) => Wallet.fromPhrase(m).address); // default path m/44'/60'/0'/0/0
  let outLines;
  let safeAddress;

  await t.test('getAddresses.js generates out.txt in order', () => {
    fs.writeFileSync(file('in.txt'), `\n${mnemonics[0]}\n\n  ${mnemonics[1]}  \r\n${mnemonics[2]}\n`);
    const r = run('getAddresses.js');
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /Processed: 3 mnemonics/);
    for (const m of mnemonics) assert.ok(!r.out.includes(m.split(' ').slice(0, 3).join(' ')));

    outLines = fs.readFileSync(file('out.txt'), 'utf8').trim().split('\n');
    assert.deepStrictEqual(outLines, expected);

    if (hasCast) {
      // Independent cross-check with Foundry's implementation.
      const viaCast = mnemonics.map((m) =>
        spawnSync('cast', ['wallet', 'address', '--mnemonic', m], { encoding: 'utf8' }).stdout.trim()
      );
      assert.deepStrictEqual(viaCast, expected);
    }
  });

  const signer = await provider.getSigner(0); // unlocked Anvil account
  const singleton = await deploy('Safe.sol/Safe.json', signer);
  const factory = await deploy('proxies/SafeProxyFactory.sol/SafeProxyFactory.json', signer);

  await t.test('Safe with 3 owners and threshold 2 is created', async () => {
    // Owners in a different order than out.txt on purpose.
    safeAddress = await createSafe(factory, singleton, [expected[2], expected[0], expected[1]], 2, 1);
    const safe = singleton.attach(safeAddress);
    assert.strictEqual(await safe.getThreshold(), 2n);
    assert.deepStrictEqual([...(await safe.getOwners())], [expected[2], expected[0], expected[1]]);
  });

  await t.test('safeCompare.js: SAFE MATCH: YES and safe.txt', () => {
    const r = run('safeCompare.js', [safeAddress, '--rpc', rpc]);
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /^SAFE MATCH: YES/);
    assert.match(r.out, /Threshold: 2\n/);
    assert.match(r.out, /Safe signers: 3\n/);
    assert.match(r.out, /Addresses in out\.txt: 3\n/);
    assert.match(r.out, /Version: 1\.5\.0/);
    assert.match(r.out, /All addresses match\./);

    assert.strictEqual(
      fs.readFileSync(file('safe.txt'), 'utf8'),
      `Safe: ${safeAddress}\nChain ID: 31337\nVersion: 1.5.0\nThreshold: 2\nSigners: 3\n\n` +
        `${expected[2]}\n${expected[0]}\n${expected[1]}\n`
    );
  });

  await t.test('safeCompare.js reads RPC_URL from the environment', () => {
    const r = run('safeCompare.js', [safeAddress], { RPC_URL: rpc });
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /SAFE MATCH: YES/);
  });

  await t.test('different order and lowercase still match', () => {
    writeOut([outLines[1], outLines[2].toLowerCase(), outLines[0]]);
    const r = run('safeCompare.js', [safeAddress.toLowerCase(), '--rpc', rpc]);
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /SAFE MATCH: YES/);
  });

  await t.test('changed address: SAFE MATCH: NO with missing and extra', () => {
    const stranger = Wallet.createRandom().address;
    writeOut([outLines[0], stranger, outLines[2]]);
    const r = run('safeCompare.js', [safeAddress, '--rpc', rpc]);
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, /^SAFE MATCH: NO/);
    assert.match(r.out, new RegExp(`Missing from out\\.txt:\\n- ${outLines[1]}\\n`));
    assert.match(r.out, new RegExp(`Present in out\\.txt but not Safe:\\n- ${stranger}\\n`));
    assert.doesNotMatch(r.out, /Count differs/);
  });

  await t.test('missing line: count differs', () => {
    writeOut([outLines[0], outLines[1]]);
    const r = run('safeCompare.js', [safeAddress, '--rpc', rpc]);
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, /Count differs: Safe has 3 signers, out\.txt has 2 addresses\./);
    assert.match(r.out, new RegExp(`Missing from out\\.txt:\\n- ${outLines[2]}\\n`));
  });

  await t.test('duplicate in out.txt is reported', () => {
    writeOut([...outLines, outLines[0].toLowerCase()]);
    const r = run('safeCompare.js', [safeAddress, '--rpc', rpc]);
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`Duplicates in out\\.txt:\\n- ${outLines[0]} \\(lines 1, 4\\)`));
  });

  await t.test('Safe with 4 owners and threshold 3 vs 3 addresses', async () => {
    const fourth = Wallet.createRandom().address;
    const bigSafe = await createSafe(factory, singleton, [...expected, fourth], 3, 2);
    writeOut(outLines);
    const r = run('safeCompare.js', [bigSafe, '--rpc', rpc]);
    assert.strictEqual(r.code, 1, r.out);
    assert.match(r.out, /Threshold: 3\n/);
    assert.match(r.out, /Safe signers: 4\n/);
    assert.match(r.out, new RegExp(`Missing from out\\.txt:\\n- ${fourth}\\n`));
  });

  await t.test('rejects addresses that are not a Safe', async () => {
    let r = run('safeCompare.js', [Wallet.createRandom().address, '--rpc', rpc]);
    assert.strictEqual(r.code, 2, r.out);
    assert.match(r.out, /No contract code/);

    r = run('safeCompare.js', [await factory.getAddress(), '--rpc', rpc]);
    assert.strictEqual(r.code, 2, r.out);
    assert.match(r.out, /does not look like a Safe/);
  });

  await t.test('deleteInput.js removes in.txt', () => {
    const r = run('deleteInput.js');
    assert.strictEqual(r.code, 0, r.out);
    assert.ok(!fs.existsSync(file('in.txt')));
    assert.ok(fs.existsSync(file('out.txt')));
  });
});
