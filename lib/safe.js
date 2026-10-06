'use strict';

const { Contract, getAddress } = require('ethers');

const SAFE_ABI = [
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function VERSION() view returns (string)',
];

function toAddress(value, what) {
  try {
    return getAddress(value);
  } catch {
    throw new Error(`${what}: invalid Ethereum address`);
  }
}

// Reads owners and threshold directly from the Safe contract via RPC.
async function readSafe(provider, safeAddress) {
  const address = toAddress(safeAddress, 'Safe address');

  const code = await provider.getCode(address);
  if (code === '0x') throw new Error(`No contract code at ${address} on this network`);

  const safe = new Contract(address, SAFE_ABI, provider);
  let owners;
  let threshold;
  try {
    [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
  } catch (err) {
    if (err.code === 'CALL_EXCEPTION' || err.code === 'BAD_DATA') {
      throw new Error(`${address} does not look like a Safe (getOwners/getThreshold failed)`);
    }
    throw err;
  }

  owners = owners.map((o) => getAddress(o));
  if (owners.length === 0 || threshold < 1n || threshold > BigInt(owners.length)) {
    throw new Error(`${address} does not look like a valid Safe (owners: ${owners.length}, threshold: ${threshold})`);
  }

  let version = 'unknown';
  try {
    version = await safe.VERSION();
  } catch {
    // VERSION() is informational only.
  }

  const { chainId } = await provider.getNetwork();
  return { address, chainId: chainId.toString(), version, threshold: Number(threshold), owners };
}

function formatSafeTxt(safe) {
  return [
    `Safe: ${safe.address}`,
    `Chain ID: ${safe.chainId}`,
    `Version: ${safe.version}`,
    `Threshold: ${safe.threshold}`,
    `Signers: ${safe.owners.length}`,
    '',
    ...safe.owners,
    '',
  ].join('\n');
}

// Parses out.txt: one address per line, blank lines ignored. Any casing is accepted,
// but mixed-case addresses must have a valid EIP-55 checksum.
function parseAddresses(text) {
  const result = [];
  text.replace(/^﻿/, '').split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    result.push({ line: i + 1, address: toAddress(line, `out.txt line ${i + 1}`) });
  });
  return result;
}

// Compares out.txt entries ({ line, address }) against Safe owners. Order does not matter.
function compareAddresses(entries, owners) {
  const linesByAddress = new Map();
  for (const { line, address } of entries) {
    if (!linesByAddress.has(address)) linesByAddress.set(address, []);
    linesByAddress.get(address).push(line);
  }
  const ownerSet = new Set(owners.map((o) => getAddress(o)));

  const duplicates = [...linesByAddress]
    .filter(([, lines]) => lines.length > 1)
    .map(([address, lines]) => ({ address, lines }));
  const missing = [...ownerSet].filter((o) => !linesByAddress.has(o));
  const extra = [...linesByAddress.keys()].filter((a) => !ownerSet.has(a));
  const countMismatch = entries.length !== ownerSet.size;

  return {
    match: !countMismatch && duplicates.length === 0 && missing.length === 0 && extra.length === 0,
    countMismatch,
    duplicates,
    missing,
    extra,
  };
}

module.exports = { readSafe, formatSafeTxt, parseAddresses, compareAddresses };
