#!/usr/bin/env node
'use strict';

// Reads owners/threshold from a Safe via RPC, writes safe.txt and compares against out.txt.
// Usage: node safeCompare.js <SAFE_ADDRESS> [--rpc <RPC_URL>]   (or set RPC_URL)
// Exit codes: 0 = match, 1 = mismatch, 2 = error.

const fs = require('fs');
const path = require('path');
const { FetchRequest, JsonRpcProvider } = require('ethers');
const { readSafe, formatSafeTxt, parseAddresses, compareAddresses } = require('./lib/safe');

const USAGE = 'Usage: node safeCompare.js <SAFE_ADDRESS> [--rpc <RPC_URL>]  (or set RPC_URL)';
const OUT_FILE = path.resolve('out.txt');
const SAFE_FILE = path.resolve('safe.txt');

function parseArgs(argv) {
  let safe;
  let rpc = process.env.RPC_URL;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rpc') {
      rpc = argv[++i];
      if (!rpc) throw new Error(`--rpc requires a URL\n${USAGE}`);
    } else if (!safe) {
      safe = argv[i];
    } else {
      throw new Error(`Unexpected argument: ${argv[i]}\n${USAGE}`);
    }
  }
  if (!safe) throw new Error(`Missing Safe address\n${USAGE}`);
  if (!rpc) throw new Error(`Missing RPC: use --rpc <RPC_URL> or set RPC_URL\n${USAGE}`);
  return { safe, rpc };
}

// Detects the chain id once so the provider never enters ethers' endless network-detection retry loop.
async function connect(rpc) {
  const req = new FetchRequest(rpc);
  req.timeout = 30000;
  req.body = { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] };
  let chainId;
  try {
    const res = await req.send();
    res.assertOk();
    chainId = BigInt(res.bodyJson.result);
  } catch {
    throw new Error('Could not connect to the RPC (eth_chainId failed). Check the RPC URL.');
  }
  return new JsonRpcProvider(rpc, chainId, { staticNetwork: true });
}

function list(title, items) {
  if (items.length === 0) return;
  console.log(`\n${title}`);
  for (const item of items) console.log(`- ${item}`);
}

async function main() {
  const { safe: safeArg, rpc } = parseArgs(process.argv.slice(2));

  const provider = await connect(rpc);
  let safe;
  try {
    safe = await readSafe(provider, safeArg);
  } finally {
    provider.destroy();
  }

  fs.writeFileSync(SAFE_FILE, formatSafeTxt(safe));

  if (!fs.existsSync(OUT_FILE)) throw new Error('out.txt not found. Run "node getAddresses.js" first.');
  const entries = parseAddresses(fs.readFileSync(OUT_FILE, 'utf8'));
  if (entries.length === 0) throw new Error('out.txt contains no addresses');

  const result = compareAddresses(entries, safe.owners);

  console.log(`SAFE MATCH: ${result.match ? 'YES' : 'NO'}\n`);
  console.log(`Safe: ${safe.address}`);
  console.log(`Chain ID: ${safe.chainId}`);
  console.log(`Version: ${safe.version}`);
  console.log(`Threshold: ${safe.threshold}`);
  console.log(`Safe signers: ${safe.owners.length}`);
  console.log(`Addresses in out.txt: ${entries.length}`);
  console.log('Safe details: safe.txt');

  if (result.match) {
    console.log('\nAll addresses match.');
    return 0;
  }

  if (result.countMismatch) {
    console.log(`\nCount differs: Safe has ${safe.owners.length} signers, out.txt has ${entries.length} addresses.`);
  }
  list('Duplicates in out.txt:', result.duplicates.map((d) => `${d.address} (lines ${d.lines.join(', ')})`));
  list('Missing from out.txt:', result.missing);
  list('Present in out.txt but not Safe:', result.extra);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // ethers errors can embed the RPC URL (which may contain an API key); print the short form.
    console.error(`Error: ${err.shortMessage || err.message}`);
    process.exit(2);
  }
);
